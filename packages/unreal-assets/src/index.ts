import { execFile } from "node:child_process";
import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import { decodeAuthoringTableSnapshot, type AuthoringTableSnapshot } from "@ue-shed/protocol";
import { Data, Effect } from "effect";

const execFileAsync = promisify(execFile);
const MAX_OUTPUT_BYTES = 16 * 1024 * 1024;

export class AssetReaderError extends Data.TaggedError("AssetReaderError")<{
	readonly kind: "process" | "contract" | "discovery";
	readonly message: string;
	readonly path?: string;
	readonly exitCode?: number;
}> {}

export interface ReadSavedTableOptions {
	readonly assetPath: string;
	readonly executable?: string;
}

interface ProcessFailure {
	readonly code?: number | string;
	readonly stdout?: string;
	readonly stderr?: string;
	readonly message?: string;
}

function executableFrom(options: ReadSavedTableOptions): string {
	return options.executable ?? process.env.UE_SHED_UASSET_EXECUTABLE ?? "uasset";
}

export function readSavedTable(
	options: ReadSavedTableOptions
): Effect.Effect<AuthoringTableSnapshot, AssetReaderError> {
	return Effect.tryPromise({
		try: async () => {
			try {
				return await execFileAsync(
					executableFrom(options),
					["authoring", options.assetPath, "--format", "json"],
					{ encoding: "utf8", maxBuffer: MAX_OUTPUT_BYTES, windowsHide: true }
				);
			} catch (cause) {
				const failure = cause as ProcessFailure;
				if (failure.code === 6 && failure.stdout) {
					return { stdout: failure.stdout, stderr: failure.stderr ?? "" };
				}
				throw cause;
			}
		},
		catch: (cause) => {
			const failure = cause as ProcessFailure;
			return new AssetReaderError({
				kind: "process",
				message: failure.stderr?.trim() || failure.message || "Asset reader failed",
				path: options.assetPath,
				...(typeof failure.code === "number" ? { exitCode: failure.code } : {})
			});
		}
	}).pipe(
		Effect.flatMap(({ stdout }) =>
			Effect.try({
				try: () => decodeAuthoringTableSnapshot(JSON.parse(stdout)),
				catch: (cause) =>
					new AssetReaderError({
						kind: "contract",
						message: `Invalid authoring output: ${String(cause)}`,
						path: options.assetPath
					})
			})
		)
	);
}

export function discoverSavedAssets(
	projectRoot: string
): Effect.Effect<string[], AssetReaderError> {
	const contentRoot = join(projectRoot, "Content");
	return Effect.tryPromise({
		try: async () => {
			const found: string[] = [];
			const visit = async (directory: string): Promise<void> => {
				const entries = await readdir(directory, { withFileTypes: true });
				entries.sort((left, right) => left.name.localeCompare(right.name));
				for (const entry of entries) {
					const path = join(directory, entry.name);
					if (entry.isDirectory()) {
						await visit(path);
					} else if (entry.isFile() && entry.name.endsWith(".uasset")) {
						found.push(path);
					}
				}
			};
			await visit(contentRoot);
			return found;
		},
		catch: (cause) =>
			new AssetReaderError({
				kind: "discovery",
				message: `Could not discover saved assets: ${String(cause)}`,
				path: contentRoot
			})
	});
}
