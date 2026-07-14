import {
	AuthoringCommand as AuthoringCommandSchema,
	AuthoringTableSnapshot as AuthoringTableSnapshotSchema,
	type AuthoringFieldValue,
	type AuthoringCommand,
	type AuthoringTableSnapshot,
	type AuthoringValue
} from "@ue-shed/protocol";
import { Data, Schema } from "effect";

export type { AuthoringCommand } from "@ue-shed/protocol";

export interface CommandEnvelope {
	readonly id: string;
	readonly groupId: string;
	readonly authoredAt: string;
	readonly author?: string | undefined;
	readonly tableObjectPath: string;
	readonly baseFingerprint: string;
	readonly body: AuthoringCommand;
}

export interface DraftSession {
	readonly version: 2;
	readonly id: string;
	readonly base: Readonly<Record<string, AuthoringTableSnapshot>>;
	readonly fingerprints: Readonly<Record<string, string>>;
	readonly commands: readonly CommandEnvelope[];
	readonly undoPointer: number;
	readonly applyReceipts: readonly ApplyReceipt[];
	readonly saveReceipts: readonly SaveReceipt[];
	readonly awaitingSave: readonly string[];
}

export interface ApplyReceipt {
	readonly operationId: string;
	readonly appliedAt: string;
	readonly tableObjectPaths: readonly string[];
	readonly status: "committed" | "rolled_back" | "rejected" | "indeterminate";
}

export interface SaveReceipt {
	readonly requestId: string;
	readonly savedAt: string;
	readonly status: "complete" | "partial" | "failed";
	readonly packages: readonly {
		readonly objectPath: string;
		readonly packageName: string;
		readonly status: "saved" | "failed";
		readonly retrySafe: boolean;
		readonly message?: string | undefined;
	}[];
}

const CommandEnvelopeSchema = Schema.Struct({
	author: Schema.optional(Schema.String),
	authoredAt: Schema.String,
	baseFingerprint: Schema.String,
	body: AuthoringCommandSchema,
	groupId: Schema.String,
	id: Schema.String,
	tableObjectPath: Schema.String
});

const ApplyReceiptsSchema = Schema.Array(
	Schema.Struct({
		appliedAt: Schema.String,
		operationId: Schema.String,
		status: Schema.Literal("committed", "rolled_back", "rejected", "indeterminate"),
		tableObjectPaths: Schema.Array(Schema.String)
	})
);

const DraftSessionV1Schema = Schema.Struct({
	applyReceipts: ApplyReceiptsSchema,
	awaitingSave: Schema.Array(Schema.String),
	base: Schema.Record({ key: Schema.String, value: AuthoringTableSnapshotSchema }),
	commands: Schema.Array(CommandEnvelopeSchema),
	fingerprints: Schema.Record({ key: Schema.String, value: Schema.String }),
	id: Schema.String,
	undoPointer: Schema.NonNegativeInt,
	version: Schema.Literal(1)
});

export const DraftSessionSchema = Schema.Struct({
	applyReceipts: ApplyReceiptsSchema,
	awaitingSave: Schema.Array(Schema.String),
	base: Schema.Record({ key: Schema.String, value: AuthoringTableSnapshotSchema }),
	commands: Schema.Array(CommandEnvelopeSchema),
	fingerprints: Schema.Record({ key: Schema.String, value: Schema.String }),
	id: Schema.String,
	saveReceipts: Schema.Array(
		Schema.Struct({
			packages: Schema.Array(
				Schema.Struct({
					message: Schema.optional(Schema.String),
					objectPath: Schema.String,
					packageName: Schema.String,
					retrySafe: Schema.Boolean,
					status: Schema.Literal("saved", "failed")
				})
			),
			requestId: Schema.String,
			savedAt: Schema.String,
			status: Schema.Literal("complete", "partial", "failed")
		})
	),
	undoPointer: Schema.NonNegativeInt,
	version: Schema.Literal(2)
});

const decodePersistedDraftSession = Schema.decodeUnknownSync(
	Schema.Union(DraftSessionV1Schema, DraftSessionSchema)
);

export function decodeDraftSession(input: unknown): DraftSession {
	const session = decodePersistedDraftSession(input);
	return session.version === 1 ? { ...session, saveReceipts: [], version: 2 } : session;
}

export class DraftFoldError extends Data.TaggedError("DraftFoldError")<{
	readonly commandId: string;
	readonly message: string;
}> {}

export class DraftBuildError extends Data.TaggedError("DraftBuildError")<{
	readonly message: string;
}> {}

function fail(command: CommandEnvelope, message: string): never {
	throw new DraftFoldError({ commandId: command.id, message });
}

function replaceField(
	fields: readonly AuthoringFieldValue[],
	fieldName: string,
	value: AuthoringValue,
	command: CommandEnvelope
): readonly AuthoringFieldValue[] {
	const index = fields.findIndex((field) => field.name === fieldName);
	if (index === -1) {
		return fail(command, `Field ${fieldName} does not exist`);
	}
	return fields.map((field, current) => (current === index ? { ...field, value } : field));
}

export function foldTable(
	base: AuthoringTableSnapshot,
	commands: readonly CommandEnvelope[]
): AuthoringTableSnapshot {
	let rows = [...base.table.rows];
	for (const command of commands) {
		if (command.tableObjectPath !== base.table.objectPath) {
			continue;
		}
		const body = command.body;
		switch (body.kind) {
			case "set_cell": {
				const index = rows.findIndex((row) => row.id === body.rowId);
				if (index === -1) fail(command, `Row ${body.rowId} does not exist`);
				const row = rows[index]!;
				const current = row.fields.find((field) => field.name === body.fieldName);
				if (!current || JSON.stringify(current.value) !== JSON.stringify(body.oldValue)) {
					fail(
						command,
						`Field ${body.fieldName} no longer matches its recorded old value`
					);
				}
				rows[index] = {
					...row,
					fields: replaceField(row.fields, body.fieldName, body.newValue, command)
				};
				break;
			}
			case "add_row": {
				if (rows.some((row) => row.id === body.row.id || row.name === body.row.name)) {
					fail(command, `Row ${body.row.name} already exists`);
				}
				if (body.atIndex < 0 || body.atIndex > rows.length)
					fail(command, "Add index is invalid");
				rows.splice(body.atIndex, 0, body.row);
				break;
			}
			case "remove_row": {
				const index = rows.findIndex((row) => row.id === body.row.id);
				if (index === -1) fail(command, `Row ${body.row.id} does not exist`);
				if (index !== body.atIndex)
					fail(command, `Row ${body.row.id} moved before removal`);
				rows.splice(index, 1);
				break;
			}
			case "rename_row": {
				const index = rows.findIndex((row) => row.id === body.rowId);
				if (index === -1) fail(command, `Row ${body.rowId} does not exist`);
				if (rows[index]!.name !== body.oldName) {
					fail(command, `Row ${body.rowId} no longer has its recorded old name`);
				}
				if (rows.some((row) => row.name === body.newName)) {
					fail(command, `Row ${body.newName} already exists`);
				}
				rows[index] = { ...rows[index]!, name: body.newName };
				break;
			}
			case "reorder_rows": {
				if (JSON.stringify(rows.map((row) => row.id)) !== JSON.stringify(body.oldOrder)) {
					fail(command, "Rows no longer match the recorded old order");
				}
				const current = rows.map((row) => row.id).toSorted();
				const requested = [...body.newOrder].toSorted();
				if (JSON.stringify(current) !== JSON.stringify(requested)) {
					fail(command, "Reorder must be a permutation of current row identities");
				}
				const byId = new Map(rows.map((row) => [row.id, row]));
				rows = body.newOrder.map((id) => byId.get(id)!);
				break;
			}
		}
	}
	return { ...base, table: { ...base.table, rows } };
}

export function appendCommandGroup(
	session: DraftSession,
	commands: readonly CommandEnvelope[]
): DraftSession {
	if (commands.length === 0) return session;
	const groupId = commands[0]!.groupId;
	if (commands.some((command) => command.groupId !== groupId)) {
		throw new Error("One append must contain exactly one command group");
	}
	const active = session.commands.slice(0, session.undoPointer);
	return {
		...session,
		commands: [...active, ...commands],
		undoPointer: active.length + commands.length
	};
}

export function undo(session: DraftSession): DraftSession {
	if (session.undoPointer === 0) return session;
	const groupId = session.commands[session.undoPointer - 1]!.groupId;
	let pointer = session.undoPointer;
	while (pointer > 0 && session.commands[pointer - 1]!.groupId === groupId) pointer--;
	return { ...session, undoPointer: pointer };
}

export function redo(session: DraftSession): DraftSession {
	if (session.undoPointer >= session.commands.length) return session;
	const groupId = session.commands[session.undoPointer]!.groupId;
	let pointer = session.undoPointer;
	while (pointer < session.commands.length && session.commands[pointer]!.groupId === groupId)
		pointer++;
	return { ...session, undoPointer: pointer };
}

export function workingTable(session: DraftSession, objectPath: string): AuthoringTableSnapshot {
	const base = session.base[objectPath];
	if (!base) throw new Error(`Session has no base snapshot for ${objectPath}`);
	return foldTable(base, session.commands.slice(0, session.undoPointer));
}

export function createDraftSession(
	id: string,
	snapshots: readonly AuthoringTableSnapshot[],
	fingerprint: (snapshot: AuthoringTableSnapshot) => string
): DraftSession {
	const base: Record<string, AuthoringTableSnapshot> = {};
	const fingerprints: Record<string, string> = {};
	for (const snapshot of snapshots) {
		base[snapshot.table.objectPath] = snapshot;
		fingerprints[snapshot.table.objectPath] = fingerprint(snapshot);
	}
	return {
		applyReceipts: [],
		awaitingSave: [],
		base,
		commands: [],
		fingerprints,
		id,
		saveReceipts: [],
		undoPointer: 0,
		version: 2
	};
}

export function buildSetCellCommand(args: {
	readonly session: DraftSession;
	readonly tableObjectPath: string;
	readonly rowName: string;
	readonly fieldName: string;
	readonly value: AuthoringValue;
	readonly commandId: string;
	readonly groupId: string;
	readonly authoredAt: string;
	readonly author?: string;
}): CommandEnvelope {
	const table = workingTable(args.session, args.tableObjectPath);
	const row = table.table.rows.find((candidate) => candidate.name === args.rowName);
	if (!row) throw new DraftBuildError({ message: `Row ${args.rowName} does not exist` });
	const field = row.fields.find((candidate) => candidate.name === args.fieldName);
	if (!field) throw new DraftBuildError({ message: `Field ${args.fieldName} does not exist` });
	return {
		authoredAt: args.authoredAt,
		baseFingerprint: args.session.fingerprints[args.tableObjectPath]!,
		body: {
			fieldName: args.fieldName,
			kind: "set_cell",
			newValue: args.value,
			oldValue: field.value,
			rowId: row.id
		},
		groupId: args.groupId,
		id: args.commandId,
		tableObjectPath: args.tableObjectPath,
		...(args.author === undefined ? {} : { author: args.author })
	};
}

export function invertCommand(command: AuthoringCommand): AuthoringCommand {
	switch (command.kind) {
		case "set_cell":
			return { ...command, newValue: command.oldValue, oldValue: command.newValue };
		case "add_row":
			return { atIndex: command.atIndex, kind: "remove_row", row: command.row };
		case "remove_row":
			return { atIndex: command.atIndex, kind: "add_row", row: command.row };
		case "rename_row":
			return {
				kind: "rename_row",
				newName: command.oldName,
				oldName: command.newName,
				rowId: command.rowId
			};
		case "reorder_rows":
			return { kind: "reorder_rows", newOrder: command.oldOrder, oldOrder: command.newOrder };
	}
}
