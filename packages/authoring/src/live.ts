import type {
	AuthoringApplyRequest,
	AuthoringApplyResult,
	AuthoringSaveRequest,
	AuthoringSaveResult
} from "@ue-shed/protocol";
import { Data, Effect } from "effect";
import type { DraftSession, SaveReceipt } from "./draft.js";
import { fingerprintTable } from "./fingerprint.js";

export interface AuthoringLivePort<E> {
	readonly apply: (request: AuthoringApplyRequest) => Effect.Effect<AuthoringApplyResult, E>;
	readonly lookupApplyResult: (operationId: string) => Effect.Effect<AuthoringApplyResult, E>;
	readonly save: (request: AuthoringSaveRequest) => Effect.Effect<AuthoringSaveResult, E>;
}

export class ApplyWorkflowError extends Data.TaggedError("ApplyWorkflowError")<{
	readonly operationId: string;
	readonly message: string;
}> {}

export type ApplyDispatchOutcome<E> =
	| {
			readonly kind: "known";
			readonly result: AuthoringApplyResult;
			readonly session: DraftSession;
	  }
	| {
			readonly kind: "indeterminate";
			readonly cause: E;
			readonly session: DraftSession;
	  };

function activeCommands(session: DraftSession) {
	return session.commands.slice(0, session.undoPointer);
}

export function buildApplyRequest(
	session: DraftSession,
	operationId: string
): AuthoringApplyRequest {
	const commands = activeCommands(session);
	const tableObjectPaths = [...new Set(commands.map((command) => command.tableObjectPath))];
	if (tableObjectPaths.length === 0) {
		throw new ApplyWorkflowError({ operationId, message: "Draft has no active commands" });
	}
	return {
		commands: commands.map((command) => ({
			body: command.body,
			id: command.id,
			tableObjectPath: command.tableObjectPath
		})),
		contract: {
			name: "unreal-authoring-apply",
			version: { major: 1, minor: 0 }
		},
		operationId,
		tables: tableObjectPaths.map((objectPath) => {
			const expectedFingerprint = session.fingerprints[objectPath];
			if (!expectedFingerprint) {
				throw new ApplyWorkflowError({
					message: `Draft has no base fingerprint for ${objectPath}`,
					operationId
				});
			}
			return { expectedFingerprint, objectPath };
		})
	};
}

export function acceptApplyResult(
	session: DraftSession,
	result: AuthoringApplyResult,
	appliedAt: string
): DraftSession {
	const tableObjectPaths = result.snapshots.map((snapshot) => snapshot.table.objectPath);
	const receipt = {
		appliedAt,
		operationId: result.operationId,
		status: result.status,
		tableObjectPaths
	} as const;
	if (result.status !== "committed") {
		return { ...session, applyReceipts: [...session.applyReceipts, receipt] };
	}
	const requestedPaths = [
		...new Set(activeCommands(session).map((command) => command.tableObjectPath))
	];
	const snapshots = new Map(
		result.snapshots.map((snapshot) => [snapshot.table.objectPath, snapshot])
	);
	for (const objectPath of requestedPaths) {
		if (!snapshots.has(objectPath)) {
			throw new ApplyWorkflowError({
				message: `Committed Apply omitted the live snapshot for ${objectPath}`,
				operationId: result.operationId
			});
		}
	}
	const base = { ...session.base };
	const fingerprints = { ...session.fingerprints };
	for (const [objectPath, snapshot] of snapshots) {
		base[objectPath] = snapshot;
		fingerprints[objectPath] = fingerprintTable(snapshot);
	}
	return {
		...session,
		applyReceipts: [...session.applyReceipts, receipt],
		awaitingSave: [...new Set([...session.awaitingSave, ...requestedPaths])],
		base,
		commands: [],
		fingerprints,
		undoPointer: 0
	};
}

function markIndeterminate(
	session: DraftSession,
	operationId: string,
	appliedAt: string,
	tableObjectPaths: readonly string[]
): DraftSession {
	return {
		...session,
		applyReceipts: [
			...session.applyReceipts,
			{ appliedAt, operationId, status: "indeterminate", tableObjectPaths }
		]
	};
}

export function dispatchApply<E>(args: {
	readonly session: DraftSession;
	readonly operationId: string;
	readonly appliedAt: string;
	readonly port: AuthoringLivePort<E>;
}): Effect.Effect<ApplyDispatchOutcome<E>, ApplyWorkflowError> {
	return Effect.try({
		try: () => buildApplyRequest(args.session, args.operationId),
		catch: (cause) =>
			cause instanceof ApplyWorkflowError
				? cause
				: new ApplyWorkflowError({ message: String(cause), operationId: args.operationId })
	}).pipe(
		Effect.flatMap((request) =>
			args.port.apply(request).pipe(
				Effect.flatMap((result) =>
					Effect.try({
						try: () => ({
							kind: "known" as const,
							result,
							session: acceptApplyResult(args.session, result, args.appliedAt)
						}),
						catch: (cause) =>
							cause instanceof ApplyWorkflowError
								? cause
								: new ApplyWorkflowError({
										message: String(cause),
										operationId: args.operationId
									})
					})
				),
				Effect.catchAll((cause) =>
					cause instanceof ApplyWorkflowError
						? Effect.fail(cause)
						: Effect.succeed({
								cause: cause as E,
								kind: "indeterminate" as const,
								session: markIndeterminate(
									args.session,
									args.operationId,
									args.appliedAt,
									request.tables.map((table) => table.objectPath)
								)
							})
				)
			)
		),
		Effect.withSpan("authoring.apply", {
			attributes: { "authoring.operation_id": args.operationId }
		})
	);
}

export function buildSaveRequest(session: DraftSession, requestId: string): AuthoringSaveRequest {
	if (session.awaitingSave.length === 0) {
		throw new Error("Draft has no applied assets awaiting Save");
	}
	return {
		contract: { name: "unreal-authoring-save", version: { major: 1, minor: 0 } },
		objectPaths: session.awaitingSave,
		requestId
	};
}

export function acceptSaveResult(
	session: DraftSession,
	result: AuthoringSaveResult,
	savedAt: string
): DraftSession {
	const savedPaths = new Set(
		result.packages
			.filter((packageResult) => packageResult.status === "saved")
			.map((packageResult) => packageResult.objectPath)
	);
	const receipt: SaveReceipt = {
		packages: result.packages,
		requestId: result.requestId,
		savedAt,
		status: result.status
	};
	return {
		...session,
		awaitingSave: session.awaitingSave.filter((objectPath) => !savedPaths.has(objectPath)),
		saveReceipts: [...session.saveReceipts, receipt]
	};
}
