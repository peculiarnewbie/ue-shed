import type { AuthoringTableSnapshotV2 } from "@ue-shed/protocol";
import type { SavedTableCatalog } from "@ue-shed/unreal-assets";
import { describe, expect, it } from "vitest";
import { mergeAuthoringTableCatalogs } from "./index.js";

const objectPath = "/Game/Fixture/Authoring/DT_Items.DT_Items";

const saved: SavedTableCatalog = {
	diagnostics: [],
	projectRoot: "fixture",
	scannedAssets: 1,
	tables: [
		{
			assetPath: "DT_Items.uasset",
			authority: { kind: "project_files", packageName: "/Game/Fixture/Authoring/DT_Items" },
			completeness: "complete",
			kind: "data_table",
			objectPath,
			parentTables: [],
			rowStruct: "/Script/Fixture.ItemRow",
			schema: { reason: "Not resolved", status: "unavailable" }
		}
	]
};

function live(rowStruct = "/Script/Fixture.ItemRow"): AuthoringTableSnapshotV2 {
	return {
		authority: { kind: "live_editor", producerId: "producer", sessionId: "session" },
		completeness: "complete",
		contract: { name: "unreal-authoring", version: { major: 2, minor: 0 } },
		diagnostics: [],
		fingerprint: {
			algorithm: "sha256",
			status: "available",
			value: "sha256-v1:test",
			version: 1
		},
		producer: { name: "UEShedAuthoring", version: "1" },
		table: {
			kind: "data_table",
			objectPath,
			packageName: "/Game/Fixture/Authoring/DT_Items",
			parentTables: [],
			rows: [],
			rowStruct,
			schema: { fields: [], source: "live_reflection", status: "available" }
		}
	};
}

describe("authoring project catalog merge", () => {
	it("preserves both authorities without treating schema availability as divergence", () => {
		const [entry] = mergeAuthoringTableCatalogs({ live: [live()], saved });

		expect(entry?.authorities.map(({ authority }) => authority)).toEqual(["saved", "live"]);
		expect(entry?.divergence).toEqual({ status: "none" });
		expect(entry?.authorities[0]?.schema.status).toBe("unavailable");
		expect(entry?.authorities[1]?.schema.status).toBe("available");
	});

	it("reports saved/live identity divergence and prefers live evidence", () => {
		const [entry] = mergeAuthoringTableCatalogs({
			live: [live("/Script/Fixture.NewItemRow")],
			saved
		});

		expect(entry?.divergence).toEqual({ fields: ["rowStruct"], status: "detected" });
		expect(entry?.rowStruct).toBe("/Script/Fixture.NewItemRow");
	});
});
