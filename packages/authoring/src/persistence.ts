import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { Data, Effect } from "effect";
import { decodeDraftSession, type DraftSession } from "./draft.js";

export class SessionPersistenceError extends Data.TaggedError("SessionPersistenceError")<{
	readonly operation: "load" | "save";
	readonly path: string;
	readonly message: string;
}> {}

export function saveDraftSession(
	path: string,
	session: DraftSession
): Effect.Effect<void, SessionPersistenceError> {
	return Effect.tryPromise({
		try: async () => {
			await mkdir(dirname(path), { recursive: true });
			const temporary = `${path}.${randomUUID()}.tmp`;
			try {
				await writeFile(temporary, `${JSON.stringify(session, null, "\t")}\n`, {
					encoding: "utf8",
					flag: "wx"
				});
				await rename(temporary, path);
			} catch (cause) {
				await rm(temporary, { force: true });
				throw cause;
			}
		},
		catch: (cause) =>
			new SessionPersistenceError({ message: String(cause), operation: "save", path })
	});
}

export function loadDraftSession(
	path: string
): Effect.Effect<DraftSession, SessionPersistenceError> {
	return Effect.tryPromise({
		try: async () => decodeDraftSession(JSON.parse(await readFile(path, "utf8"))),
		catch: (cause) =>
			new SessionPersistenceError({ message: String(cause), operation: "load", path })
	});
}
