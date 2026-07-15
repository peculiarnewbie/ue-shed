import type { AuthoringTableSnapshot } from "@ue-shed/protocol";
import { mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Effect } from "effect";
import { describe, expect, it } from "vitest";
import { buildSetCellCommand, makeAuthoringSessionService, workingTable } from "./index.js";

function snapshot(): AuthoringTableSnapshot {
	return {
		authority: { kind: "project_files", packageName: "/Game/Fixture/DT_Test" },
		completeness: "complete",
		contract: { name: "unreal-authoring", version: { major: 1, minor: 0 } },
		diagnostics: [],
		table: {
			kind: "data_table",
			objectPath: "/Game/Fixture/DT_Test.DT_Test",
			parentTables: [],
			rows: [
				{
					fields: [
						{
							name: "Count",
							typeName: "IntProperty",
							value: { kind: "int", value: "1" }
						}
					],
					id: "row:Alpha",
					name: "Alpha"
				}
			],
			rowStruct: "/Script/Fixture.Row"
		}
	};
}

describe("AuthoringSessionService", () => {
	it("persists create, append, undo, close, and resume across service restarts", async () => {
		const root = await mkdtemp(join(tmpdir(), "ue-shed-session-service-"));
		const storageRoot = join(root, "sessions");
		let tick = 0;
		const makeService = () =>
			Effect.runSync(
				makeAuthoringSessionService(
					{ projectId: "fixture", projectRoot: root, storageRoot },
					{
						makeId: () => "draft-1",
						now: () => `2026-07-15T00:00:0${tick++}.000Z`
					}
				)
			);
		try {
			const first = makeService();
			const created = await Effect.runPromise(first.create([snapshot()]));
			const command = buildSetCellCommand({
				authoredAt: "2026-07-15T00:00:01.000Z",
				commandId: "command-1",
				fieldName: "Count",
				groupId: "gesture-1",
				rowName: "Alpha",
				session: created.draft,
				tableObjectPath: "/Game/Fixture/DT_Test.DT_Test",
				value: { kind: "int", value: "2" }
			});
			await Effect.runPromise(first.append("draft-1", [command]));

			const restarted = makeService();
			const reopened = await Effect.runPromise(restarted.open("draft-1"));
			expect(
				workingTable(reopened.draft, "/Game/Fixture/DT_Test.DT_Test").table.rows[0]
			).toMatchObject({ fields: [{ value: { value: "2" } }] });
			expect((await Effect.runPromise(restarted.undo("draft-1"))).draft.undoPointer).toBe(0);
			expect((await Effect.runPromise(restarted.close("draft-1"))).lifecycle).toBe("closed");
			expect((await Effect.runPromise(restarted.resume("draft-1"))).lifecycle).toBe("open");
			expect((await Effect.runPromise(restarted.list())).sessions).toHaveLength(1);
			await Effect.runPromise(restarted.discard("draft-1"));
			expect((await Effect.runPromise(restarted.list())).sessions).toEqual([]);
		} finally {
			await rm(root, { force: true, recursive: true });
		}
	});

	it("quarantines malformed sessions instead of overwriting them", async () => {
		const root = await mkdtemp(join(tmpdir(), "ue-shed-session-corrupt-"));
		const storageRoot = join(root, "sessions");
		try {
			const service = Effect.runSync(
				makeAuthoringSessionService({
					projectId: "fixture",
					projectRoot: root,
					storageRoot
				})
			);
			await Effect.runPromise(service.list());
			await writeFile(join(storageRoot, "broken.json"), "{ truncated", "utf8");
			const listed = await Effect.runPromise(service.list());
			expect(listed.sessions).toEqual([]);
			expect(listed.diagnostics).toHaveLength(1);
			expect(
				(await readdir(storageRoot)).some((name) => name.startsWith("broken.json.corrupt-"))
			).toBe(true);
		} finally {
			await rm(root, { force: true, recursive: true });
		}
	});
});
