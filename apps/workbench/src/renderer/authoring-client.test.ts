import { describe, expect, it } from "vitest";

import { decodeAuthoringCatalogResult } from "./authoring-client.js";

describe("Workbench authoring catalog boundary", () => {
	it("accepts a catalog without exposing saved asset paths", async () => {
		expect(
			await decodeAuthoringCatalogResult({
				diagnostics: [],
				status: "ready",
				tables: [
					{
						authorities: ["saved", "live"],
						completeness: "complete",
						divergence: [],
						kind: "data_table",
						objectPath: "/Game/Data/Items.Items",
						parentTables: [],
						rowStruct: "/Script/Fixture.ItemRow"
					}
				]
			})
		).toEqual({
			diagnostics: [],
			status: "ready",
			tables: [
				{
					authorities: ["saved", "live"],
					completeness: "complete",
					divergence: [],
					kind: "data_table",
					objectPath: "/Game/Data/Items.Items",
					parentTables: [],
					rowStruct: "/Script/Fixture.ItemRow"
				}
			]
		});
	});

	it("turns malformed host results into a typed contract failure", async () => {
		const result = await decodeAuthoringCatalogResult({
			status: "ready",
			tables: "not-an-array"
		});

		expect(result.status).toBe("failed");
		if (result.status !== "failed") throw new Error("Expected a failed catalog result");
		expect(result.error.code).toBe("contract_failure");
	});
});
