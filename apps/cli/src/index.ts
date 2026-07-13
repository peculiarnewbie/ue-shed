import { randomUUID } from "node:crypto";
import {
	appendCommandGroup,
	buildSetCellCommand,
	createDraftSession,
	fingerprintTable,
	loadDraftSession,
	redo,
	saveDraftSession,
	undo,
	workingTable
} from "@ue-shed/authoring";
import { CURRENT_PROTOCOL_VERSION, decodeAuthoringValue } from "@ue-shed/protocol";
import { readSavedTable } from "@ue-shed/unreal-assets";
import { Effect } from "effect";

const help = `UE Shed — External tools for Unreal Engine development.

Usage:
  ue-shed authoring inspect <asset> [--reader <path>]
  ue-shed authoring session create <asset> <session-file> [--reader <path>]
  ue-shed authoring session show <session-file>
  ue-shed authoring draft set-cell <session-file> <table> <row> <field> <value-json>
  ue-shed authoring draft undo <session-file>
  ue-shed authoring draft redo <session-file>
  ue-shed version
  ue-shed help

The reader defaults to UE_SHED_UASSET_EXECUTABLE or uasset on PATH.`;

function takeReader(args: readonly string[]): { args: string[]; reader?: string } {
	const remaining = [...args];
	const index = remaining.indexOf("--reader");
	if (index === -1) return { args: remaining };
	const reader = remaining[index + 1];
	if (!reader) throw new Error("--reader requires an executable path");
	remaining.splice(index, 2);
	return { args: remaining, reader };
}

function printJson(value: unknown): void {
	process.stdout.write(`${JSON.stringify(value, null, "\t")}\n`);
}

async function authoring(args: readonly string[]): Promise<void> {
	const parsed = takeReader(args);
	const [area, action, ...rest] = parsed.args;
	if (area === "inspect") {
		const [assetPath] = [action, ...rest];
		if (!assetPath) throw new Error("authoring inspect requires an asset path");
		const snapshot = await Effect.runPromise(
			readSavedTable({ assetPath, ...(parsed.reader ? { executable: parsed.reader } : {}) })
		);
		printJson({ fingerprint: fingerprintTable(snapshot), snapshot });
		return;
	}
	if (area === "session" && action === "create") {
		const [assetPath, sessionPath] = rest;
		if (!assetPath || !sessionPath) {
			throw new Error("session create requires an asset and session file");
		}
		const snapshot = await Effect.runPromise(
			readSavedTable({ assetPath, ...(parsed.reader ? { executable: parsed.reader } : {}) })
		);
		const session = createDraftSession(randomUUID(), [snapshot], fingerprintTable);
		await Effect.runPromise(saveDraftSession(sessionPath, session));
		printJson(session);
		return;
	}
	if (area === "session" && action === "show") {
		const [sessionPath] = rest;
		if (!sessionPath) throw new Error("session show requires a session file");
		printJson(await Effect.runPromise(loadDraftSession(sessionPath)));
		return;
	}
	if (area === "draft" && action === "set-cell") {
		const [sessionPath, tablePath, rowName, fieldName, valueJson] = rest;
		if (!sessionPath || !tablePath || !rowName || !fieldName || !valueJson) {
			throw new Error("draft set-cell requires session, table, row, field, and value JSON");
		}
		const session = await Effect.runPromise(loadDraftSession(sessionPath));
		const command = buildSetCellCommand({
			authoredAt: new Date().toISOString(),
			commandId: randomUUID(),
			fieldName,
			groupId: randomUUID(),
			rowName,
			session,
			tableObjectPath: tablePath,
			value: decodeAuthoringValue(JSON.parse(valueJson))
		});
		const next = appendCommandGroup(session, [command]);
		await Effect.runPromise(saveDraftSession(sessionPath, next));
		printJson({ session: next, working: workingTable(next, tablePath) });
		return;
	}
	if (area === "draft" && (action === "undo" || action === "redo")) {
		const [sessionPath] = rest;
		if (!sessionPath) throw new Error(`draft ${action} requires a session file`);
		const session = await Effect.runPromise(loadDraftSession(sessionPath));
		const next = action === "undo" ? undo(session) : redo(session);
		await Effect.runPromise(saveDraftSession(sessionPath, next));
		printJson(next);
		return;
	}
	throw new Error(`Unknown authoring command\n\n${help}`);
}

async function main(args: readonly string[]): Promise<void> {
	const [command, ...rest] = args;
	switch (command) {
		case "authoring":
			await authoring(rest);
			return;
		case "version":
		case "--version":
		case "-v":
			process.stdout.write(
				`ue-shed 0.0.0 (protocol ${CURRENT_PROTOCOL_VERSION.major}.${CURRENT_PROTOCOL_VERSION.minor})\n`
			);
			return;
		case undefined:
		case "help":
		case "--help":
		case "-h":
			process.stdout.write(`${help}\n`);
			return;
		default:
			throw new Error(`Unknown command: ${command}\n\n${help}`);
	}
}

main(process.argv.slice(2)).catch((cause: unknown) => {
	process.stderr.write(`ue-shed: ${cause instanceof Error ? cause.message : String(cause)}\n`);
	process.exitCode = 2;
});
