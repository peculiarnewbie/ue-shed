import { Effect, Exit } from "effect";
import { describe, expect, it } from "vitest";

import { decodeAuthoringCatalogResultFromHost } from "./authoring-client.js";

describe("Workbench authoring catalog boundary", () => {
	it("accepts a catalog without exposing saved asset paths", async () => {
		expect(
			await Effect.runPromise(
				decodeAuthoringCatalogResultFromHost({
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
			)
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
		const result = await Effect.runPromiseExit(
			decodeAuthoringCatalogResultFromHost({
				status: "ready",
				tables: "not-an-array"
			})
		);

		expect(Exit.isFailure(result)).toBe(true);
	});
});
