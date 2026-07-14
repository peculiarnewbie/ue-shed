import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import {
	decodeAuthoringApplyResult,
	decodeAuthoringSaveResult,
	decodeAuthoringTableSnapshot,
	type AuthoringApplyRequest,
	type AuthoringCommand,
	type AuthoringSaveRequest
} from "@ue-shed/protocol";
import { describe, expect, it } from "vitest";
import { fingerprintTable } from "./fingerprint.js";

const executable = process.env.UE_SHED_UASSET_EXECUTABLE;
const enabled = process.env.UE_SHED_UNREAL_INTEGRATION === "1" && executable;
const repositoryRoot = fileURLToPath(new URL("../../..", import.meta.url));
const objectPath = "/Game/Fixture/Authoring/DT_Scalars.DT_Scalars";
const assetPath = join(
	repositoryRoot,
	"fixtures/unreal-project/Content/Fixture/Authoring/DT_Scalars.uasset"
);

function runFixture(...args: string[]): void {
	execFileSync(process.execPath, ["scripts/unreal-fixture.mjs", ...args], {
		cwd: repositoryRoot,
		stdio: "pipe",
		timeout: 120_000,
		windowsHide: true
	});
}

function readDiskSnapshot(): unknown {
	return JSON.parse(
		execFileSync(executable!, ["authoring", assetPath, "--format", "json"], {
			encoding: "utf8",
			windowsHide: true
		})
	);
}

async function json(path: string): Promise<unknown> {
	return JSON.parse(await readFile(path, "utf8"));
}

describe.skipIf(!enabled)("real Unreal authoring mutation", () => {
	it("rolls back a failed batch, commits all command shapes, caches the result, and saves separately", async () => {
		const directory = await mkdtemp(join(tmpdir(), "ue-shed-authoring-"));
		try {
			runFixture("generate");
			const snapshots = join(directory, "snapshots");
			runFixture("snapshot", snapshots);
			const base = decodeAuthoringTableSnapshot(
				await json(join(snapshots, "DT_Scalars.json"))
			);
			const alpha = base.table.rows[0]!;
			const beta = base.table.rows[1]!;
			const enabledField = alpha.fields.find((field) => field.name === "Enabled")!;
			const changedValue = { kind: "bool", value: false } as const;
			const applyContract = {
				name: "unreal-authoring-apply",
				version: { major: 1, minor: 0 }
			} as const;

			const rollbackRequest: AuthoringApplyRequest = {
				contract: applyContract,
				operationId: "rollback-probe",
				tables: [{ expectedFingerprint: fingerprintTable(base), objectPath }],
				commands: [
					{
						body: {
							fieldName: "Enabled",
							kind: "set_cell",
							newValue: changedValue,
							oldValue: enabledField.value,
							rowId: alpha.id
						},
						id: "rollback-valid",
						tableObjectPath: objectPath
					},
					{
						body: {
							fieldName: "Missing",
							kind: "set_cell",
							newValue: changedValue,
							oldValue: enabledField.value,
							rowId: alpha.id
						},
						id: "rollback-invalid",
						tableObjectPath: objectPath
					}
				]
			};
			const rollbackInput = join(directory, "rollback-request.json");
			const rollbackOutput = join(directory, "rollback-result.json");
			await writeFile(rollbackInput, JSON.stringify(rollbackRequest), "utf8");
			runFixture("apply", rollbackInput, rollbackOutput);
			const rollback = decodeAuthoringApplyResult(await json(rollbackOutput));
			expect(rollback.status, JSON.stringify(rollback.errors)).toBe("rolled_back");
			expect(fingerprintTable(rollback.snapshots[0]!)).toBe(fingerprintTable(base));

			const driftInput = join(directory, "drift-request.json");
			const driftOutput = join(directory, "drift-result.json");
			await writeFile(
				driftInput,
				JSON.stringify({
					commands: [],
					contract: applyContract,
					operationId: "drift-probe",
					tables: [{ expectedFingerprint: "sha256-v1:stale", objectPath }]
				}),
				"utf8"
			);
			runFixture("apply", driftInput, driftOutput);
			const drift = decodeAuthoringApplyResult(await json(driftOutput));
			expect(drift.status).toBe("rejected");
			expect(drift.errors[0]?.code).toBe("fingerprint_mismatch");

			const added = { ...alpha, id: "session:added", name: "Temporary" };
			const bodies: readonly AuthoringCommand[] = [
				{
					fieldName: "Enabled",
					kind: "set_cell",
					newValue: changedValue,
					oldValue: enabledField.value,
					rowId: alpha.id
				},
				{ atIndex: 2, kind: "add_row", row: added },
				{
					kind: "rename_row",
					newName: "Scalar_Added",
					oldName: "Temporary",
					rowId: added.id
				},
				{
					kind: "reorder_rows",
					newOrder: [added.id, alpha.id, beta.id],
					oldOrder: [alpha.id, beta.id, added.id]
				},
				{ atIndex: 2, kind: "remove_row", row: beta }
			];
			const commitRequest: AuthoringApplyRequest = {
				contract: applyContract,
				operationId: "commit-and-save",
				tables: [{ expectedFingerprint: fingerprintTable(base), objectPath }],
				commands: bodies.map((body, index) => ({
					body,
					id: `command-${index}`,
					tableObjectPath: objectPath
				}))
			};
			const saveRequest: AuthoringSaveRequest = {
				contract: {
					name: "unreal-authoring-save",
					version: { major: 1, minor: 0 }
				},
				objectPaths: [objectPath],
				requestId: "save-after-commit"
			};
			const commitInput = join(directory, "commit-request.json");
			const commitOutput = join(directory, "commit-result.json");
			const saveInput = join(directory, "save-request.json");
			const saveOutput = join(directory, "save-result.json");
			const lookupOutput = join(directory, "lookup-result.json");
			await writeFile(commitInput, JSON.stringify(commitRequest), "utf8");
			await writeFile(saveInput, JSON.stringify(saveRequest), "utf8");
			runFixture(
				"apply",
				commitInput,
				commitOutput,
				saveInput,
				saveOutput,
				commitRequest.operationId,
				lookupOutput
			);
			const committed = decodeAuthoringApplyResult(await json(commitOutput));
			const lookup = decodeAuthoringApplyResult(await json(lookupOutput));
			const saved = decodeAuthoringSaveResult(await json(saveOutput));
			expect(committed.status).toBe("committed");
			expect(lookup).toEqual(committed);
			expect(saved.status).toBe("complete");
			const live = committed.snapshots[0]!;
			expect(live.table.rows.map((row) => row.name)).toEqual([
				"Scalar_Added",
				"Scalar_Alpha"
			]);
			const disk = decodeAuthoringTableSnapshot(readDiskSnapshot());
			expect(fingerprintTable(disk)).toBe(fingerprintTable(live));
		} finally {
			runFixture("generate");
			await rm(directory, { force: true, recursive: true });
		}
	}, 120_000);
});
