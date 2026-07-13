import { fileURLToPath } from "node:url";
import { Effect } from "effect";
import { describe, expect, it } from "vitest";
import { discoverSavedAssets, readSavedTable } from "./index.js";

const executable = process.env.UE_SHED_UASSET_EXECUTABLE;
const fixtureRoot = fileURLToPath(new URL("../../../fixtures/unreal-project", import.meta.url));

describe.skipIf(!executable)("saved authoring fixture", () => {
	it("reads every fixture DataTable through the shared contract", async () => {
		const assets = await Effect.runPromise(discoverSavedAssets(fixtureRoot));
		const snapshots = await Promise.all(
			assets.map((assetPath) =>
				Effect.runPromise(readSavedTable({ assetPath, executable: executable! }))
			)
		);
		expect(snapshots).toHaveLength(11);
		expect(snapshots.map((snapshot) => snapshot.table.kind)).toContain("composite_data_table");
		expect(snapshots.find((snapshot) => snapshot.completeness === "partial")).toMatchObject({
			table: { objectPath: "/Game/Fixture/Authoring/DT_Opaque.DT_Opaque" }
		});
	});
});
