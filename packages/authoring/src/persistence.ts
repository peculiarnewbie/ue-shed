import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { Effect, Schema } from "effect";
import { decodeDraftSession, type DraftSession } from "./draft.js";

export class SessionPersistenceError extends Schema.TaggedErrorClass<SessionPersistenceError>()(
	"SessionPersistenceError",
	{
		operation: Schema.Literals(["load", "save"]),
		path: Schema.String,
		message: Schema.String
	}
) {}

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
		try: async () => JSON.parse(await readFile(path, "utf8")) as unknown,
		catch: (cause) =>
			new SessionPersistenceError({ message: String(cause), operation: "load", path })
	}).pipe(
		Effect.flatMap((input) =>
			decodeDraftSession(input).pipe(
				Effect.mapError(
					(cause) =>
						new SessionPersistenceError({
							message: String(cause),
							operation: "load",
							path
						})
				)
			)
		)
	);
}
