import { randomUUID } from "node:crypto";
import { mkdir, open, readFile, readdir, rename, rm, stat } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import { Data, Effect, Schema } from "effect";
import {
	DraftSessionSchema,
	appendCommandGroup,
	createDraftSession,
	redo,
	undo,
	workingTable,
	type CommandEnvelope,
	type DraftSession
} from "./draft.js";
import { fingerprintTable } from "./fingerprint.js";
import type { AuthoringTableSnapshot } from "@ue-shed/protocol";

const SessionIdPattern = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;

const PendingOperation = Schema.Union(
	Schema.Struct({ kind: Schema.Literal("none") }),
	Schema.Struct({ kind: Schema.Literal("apply"), operationId: Schema.String }),
	Schema.Struct({ kind: Schema.Literal("save"), requestId: Schema.String })
);

export const AuthoringSessionDocument = Schema.Struct({
	contract: Schema.Struct({
		name: Schema.Literal("ue-shed-authoring-session"),
		version: Schema.Struct({ major: Schema.Literal(1), minor: Schema.NonNegativeInt })
	}),
	createdAt: Schema.String,
	draft: DraftSessionSchema,
	lifecycle: Schema.Literal("open", "closed"),
	pendingOperation: PendingOperation,
	project: Schema.Struct({ id: Schema.String, root: Schema.String }),
	updatedAt: Schema.String
});
export type AuthoringSessionDocument = Schema.Schema.Type<typeof AuthoringSessionDocument>;

const decodeDocument = Schema.decodeUnknownSync(AuthoringSessionDocument);

export class InvalidSessionIdError extends Data.TaggedError("InvalidSessionIdError")<{
	readonly sessionId: string;
	readonly message: string;
	readonly recovery: string;
}> {}

export class SessionNotFoundError extends Data.TaggedError("SessionNotFoundError")<{
	readonly sessionId: string;
	readonly message: string;
	readonly recovery: string;
}> {}

export class SessionCorruptError extends Data.TaggedError("SessionCorruptError")<{
	readonly sessionId: string;
	readonly quarantinePath: string;
	readonly message: string;
	readonly recovery: string;
}> {}

export class AuthoringSessionStorageError extends Data.TaggedError("AuthoringSessionStorageError")<{
	readonly operation: string;
	readonly sessionId?: string;
	readonly message: string;
	readonly recovery: string;
}> {}

export class AuthoringSessionTransitionError extends Data.TaggedError(
	"AuthoringSessionTransitionError"
)<{
	readonly sessionId: string;
	readonly message: string;
	readonly recovery: string;
}> {}

export type AuthoringSessionServiceError =
	| InvalidSessionIdError
	| SessionNotFoundError
	| SessionCorruptError
	| AuthoringSessionStorageError
	| AuthoringSessionTransitionError;

export interface AuthoringSessionSummary {
	readonly id: string;
	readonly lifecycle: "open" | "closed";
	readonly createdAt: string;
	readonly updatedAt: string;
	readonly tableObjectPaths: readonly string[];
	readonly commandCount: number;
	readonly undoPointer: number;
}

export interface AuthoringSessionList {
	readonly sessions: readonly AuthoringSessionSummary[];
	readonly diagnostics: readonly {
		readonly code: "session_quarantined";
		readonly message: string;
		readonly quarantinePath: string;
	}[];
}

export interface AuthoringSessionService {
	readonly storageRoot: string;
	readonly create: (
		snapshots: readonly AuthoringTableSnapshot[],
		options?: { readonly id?: string; readonly author?: string }
	) => Effect.Effect<AuthoringSessionDocument, AuthoringSessionServiceError>;
	readonly open: (
		sessionId: string
	) => Effect.Effect<AuthoringSessionDocument, AuthoringSessionServiceError>;
	readonly resume: (
		sessionId: string
	) => Effect.Effect<AuthoringSessionDocument, AuthoringSessionServiceError>;
	readonly list: () => Effect.Effect<AuthoringSessionList, AuthoringSessionStorageError>;
	readonly append: (
		sessionId: string,
		commands: readonly CommandEnvelope[]
	) => Effect.Effect<AuthoringSessionDocument, AuthoringSessionServiceError>;
	readonly undo: (
		sessionId: string
	) => Effect.Effect<AuthoringSessionDocument, AuthoringSessionServiceError>;
	readonly redo: (
		sessionId: string
	) => Effect.Effect<AuthoringSessionDocument, AuthoringSessionServiceError>;
	readonly close: (
		sessionId: string
	) => Effect.Effect<AuthoringSessionDocument, AuthoringSessionServiceError>;
	readonly discard: (sessionId: string) => Effect.Effect<void, AuthoringSessionServiceError>;
}

export interface AuthoringSessionServiceConfig {
	readonly projectRoot: string;
	readonly projectId?: string;
	readonly storageRoot?: string;
}

interface AuthoringSessionServiceDependencies {
	readonly now: () => string;
	readonly makeId: () => string;
}

function validateSessionId(sessionId: string): Effect.Effect<string, InvalidSessionIdError> {
	return SessionIdPattern.test(sessionId)
		? Effect.succeed(sessionId)
		: Effect.fail(
				new InvalidSessionIdError({
					message: `Invalid authoring session id: ${sessionId}`,
					recovery: "Use 1-128 letters, numbers, dots, underscores, or hyphens.",
					sessionId
				})
			);
}

function summary(document: AuthoringSessionDocument): AuthoringSessionSummary {
	return {
		commandCount: document.draft.commands.length,
		createdAt: document.createdAt,
		id: document.draft.id,
		lifecycle: document.lifecycle,
		tableObjectPaths: Object.keys(document.draft.base).toSorted(),
		undoPointer: document.draft.undoPointer,
		updatedAt: document.updatedAt
	};
}

export function makeAuthoringSessionService(
	config: AuthoringSessionServiceConfig,
	dependencies: AuthoringSessionServiceDependencies = {
		makeId: randomUUID,
		now: () => new Date().toISOString()
	}
): Effect.Effect<AuthoringSessionService> {
	return Effect.gen(function* () {
		const mutex = yield* Effect.makeSemaphore(1);
		const projectRoot = resolve(config.projectRoot);
		const storageRoot = resolve(
			config.storageRoot ?? join(projectRoot, ".ue-shed", "authoring", "sessions")
		);
		const project = { id: config.projectId ?? projectRoot, root: projectRoot };
		const pathFor = (sessionId: string) => join(storageRoot, `${sessionId}.json`);

		const persist = (
			document: AuthoringSessionDocument
		): Effect.Effect<void, AuthoringSessionStorageError> =>
			Effect.tryPromise({
				try: async () => {
					await mkdir(storageRoot, { recursive: true });
					const target = pathFor(document.draft.id);
					const temporary = `${target}.${randomUUID()}.tmp`;
					try {
						const handle = await open(temporary, "wx");
						try {
							await handle.writeFile(
								`${JSON.stringify(document, null, "\t")}\n`,
								"utf8"
							);
							await handle.sync();
						} finally {
							await handle.close();
						}
						await rename(temporary, target);
					} catch (cause) {
						await rm(temporary, { force: true });
						throw cause;
					}
				},
				catch: (cause) =>
					new AuthoringSessionStorageError({
						message: String(cause),
						operation: "persist",
						recovery: "Check that the project session directory is writable.",
						sessionId: document.draft.id
					})
			}).pipe(
				Effect.withSpan("authoring.session.persist", {
					attributes: { "authoring.session.id": document.draft.id }
				})
			);

		const quarantine = (
			sessionId: string,
			path: string,
			cause: unknown
		): Effect.Effect<never, SessionCorruptError | AuthoringSessionStorageError> =>
			Effect.gen(function* () {
				const quarantinePath = `${path}.corrupt-${Date.now()}`;
				yield* Effect.tryPromise({
					try: () => rename(path, quarantinePath),
					catch: (renameCause) =>
						new AuthoringSessionStorageError({
							message: String(renameCause),
							operation: "quarantine",
							recovery: "Move the malformed session aside, then retry.",
							sessionId
						})
				});
				return yield* new SessionCorruptError({
					message: `Session ${sessionId} is malformed: ${String(cause)}`,
					quarantinePath,
					recovery: "Inspect the quarantined file or create a new session.",
					sessionId
				});
			});

		const load = (
			sessionId: string
		): Effect.Effect<AuthoringSessionDocument, AuthoringSessionServiceError> =>
			validateSessionId(sessionId).pipe(
				Effect.flatMap((validId) => {
					const path = pathFor(validId);
					return Effect.tryPromise({
						try: () => readFile(path, "utf8"),
						catch: (cause) =>
							(cause as NodeJS.ErrnoException).code === "ENOENT"
								? new SessionNotFoundError({
										message: `Authoring session ${validId} does not exist`,
										recovery: "List project sessions or create a new one.",
										sessionId: validId
									})
								: new AuthoringSessionStorageError({
										message: String(cause),
										operation: "read",
										recovery: "Check access to the project session directory.",
										sessionId: validId
									})
					}).pipe(
						Effect.flatMap((contents) =>
							Effect.try({
								try: () => decodeDocument(JSON.parse(contents)),
								catch: (cause) => cause
							}).pipe(Effect.catchAll((cause) => quarantine(validId, path, cause)))
						),
						Effect.flatMap((document) =>
							document.project.id === project.id
								? Effect.succeed(document)
								: Effect.fail(
										new AuthoringSessionStorageError({
											message: `Session ${validId} belongs to project ${document.project.id}`,
											operation: "verify_project",
											recovery:
												"Open the session through its owning project.",
											sessionId: validId
										})
									)
						)
					);
				}),
				Effect.withSpan("authoring.session.open", {
					attributes: { "authoring.session.id": sessionId }
				})
			);

		const update = (
			sessionId: string,
			transition: (document: AuthoringSessionDocument) => AuthoringSessionDocument
		): Effect.Effect<AuthoringSessionDocument, AuthoringSessionServiceError> =>
			mutex.withPermits(1)(
				load(sessionId).pipe(
					Effect.flatMap((document) =>
						Effect.try({
							try: () => transition(document),
							catch: (cause) =>
								new AuthoringSessionTransitionError({
									message: String(cause),
									recovery:
										"Correct the rejected intent and retry the complete gesture.",
									sessionId
								})
						})
					),
					Effect.flatMap((document) => persist(document).pipe(Effect.as(document)))
				)
			);

		return {
			storageRoot,
			create: (snapshots, options) =>
				mutex.withPermits(1)(
					Effect.gen(function* () {
						const id = yield* validateSessionId(options?.id ?? dependencies.makeId());
						const path = pathFor(id);
						const exists = yield* Effect.tryPromise({
							try: async () => {
								try {
									await stat(path);
									return true;
								} catch (cause) {
									if ((cause as NodeJS.ErrnoException).code === "ENOENT")
										return false;
									throw cause;
								}
							},
							catch: (cause) =>
								new AuthoringSessionStorageError({
									message: String(cause),
									operation: "create",
									recovery: "Check access to the project session directory.",
									sessionId: id
								})
						});
						if (exists) {
							return yield* new AuthoringSessionStorageError({
								message: `Authoring session ${id} already exists`,
								operation: "create",
								recovery:
									"Choose a different session id or resume the existing session.",
								sessionId: id
							});
						}
						const now = dependencies.now();
						const document: AuthoringSessionDocument = {
							contract: {
								name: "ue-shed-authoring-session",
								version: { major: 1, minor: 0 }
							},
							createdAt: now,
							draft: createDraftSession(id, snapshots, fingerprintTable),
							lifecycle: "open",
							pendingOperation: { kind: "none" },
							project,
							updatedAt: now
						};
						yield* persist(document);
						return document;
					})
				),
			open: load,
			resume: (sessionId) =>
				update(sessionId, (document) => ({
					...document,
					lifecycle: "open",
					updatedAt: dependencies.now()
				})),
			list: () =>
				Effect.tryPromise({
					try: async () => {
						await mkdir(storageRoot, { recursive: true });
						return (await readdir(storageRoot)).filter((name) =>
							name.endsWith(".json")
						);
					},
					catch: (cause) =>
						new AuthoringSessionStorageError({
							message: String(cause),
							operation: "list",
							recovery: "Check access to the project session directory."
						})
				}).pipe(
					Effect.flatMap((names) =>
						Effect.forEach(
							names,
							(name) =>
								load(basename(name, ".json")).pipe(
									Effect.map((document) => ({
										document,
										kind: "document" as const
									})),
									Effect.catchAll((error) =>
										error._tag === "SessionCorruptError"
											? Effect.succeed({ error, kind: "diagnostic" as const })
											: Effect.fail(
													new AuthoringSessionStorageError({
														message: error.message,
														operation: "list_entry",
														recovery: error.recovery,
														sessionId: basename(name, ".json")
													})
												)
									)
								),
							{ concurrency: 4 }
						)
					),
					Effect.map((results) => ({
						diagnostics: results
							.filter((result) => result.kind === "diagnostic")
							.map(({ error }) => ({
								code: "session_quarantined" as const,
								message: error.message,
								quarantinePath: error.quarantinePath
							})),
						sessions: results
							.filter((result) => result.kind === "document")
							.map(({ document }) => summary(document))
							.toSorted((left, right) =>
								right.updatedAt.localeCompare(left.updatedAt)
							)
					}))
				),
			append: (sessionId, commands) =>
				update(sessionId, (document) => {
					const draft = appendCommandGroup(document.draft as DraftSession, commands);
					for (const objectPath of new Set(
						commands.map((command) => command.tableObjectPath)
					)) {
						workingTable(draft, objectPath);
					}
					return { ...document, draft, updatedAt: dependencies.now() };
				}),
			undo: (sessionId) =>
				update(sessionId, (document) => ({
					...document,
					draft: undo(document.draft as DraftSession),
					updatedAt: dependencies.now()
				})),
			redo: (sessionId) =>
				update(sessionId, (document) => ({
					...document,
					draft: redo(document.draft as DraftSession),
					updatedAt: dependencies.now()
				})),
			close: (sessionId) =>
				update(sessionId, (document) => ({
					...document,
					lifecycle: "closed",
					updatedAt: dependencies.now()
				})),
			discard: (sessionId) =>
				mutex.withPermits(1)(
					validateSessionId(sessionId).pipe(
						Effect.flatMap((validId) =>
							Effect.tryPromise({
								try: () => rm(pathFor(validId)),
								catch: (cause) =>
									(cause as NodeJS.ErrnoException).code === "ENOENT"
										? new SessionNotFoundError({
												message: `Authoring session ${validId} does not exist`,
												recovery:
													"List project sessions or create a new one.",
												sessionId: validId
											})
										: new AuthoringSessionStorageError({
												message: String(cause),
												operation: "discard",
												recovery:
													"Check access to the project session directory.",
												sessionId: validId
											})
							})
						),
						Effect.withSpan("authoring.session.discard", {
							attributes: { "authoring.session.id": sessionId }
						})
					)
				)
		};
	});
}
