import type { AuthoringTableSnapshot } from "@ue-shed/protocol";
import { describe, expect, it } from "vitest";
import { filterRows, formatAuthoringValue, tableColumns } from "./authoring-view.js";

const snapshot: AuthoringTableSnapshot = {
	contract: { name: "unreal-authoring", version: { major: 1, minor: 0 } },
	authority: { kind: "project_files", packageName: "/Game/Fixture/DT_Test" },
	completeness: "complete",
	diagnostics: [],
	table: {
		kind: "data_table",
		objectPath: "/Game/Fixture/DT_Test.DT_Test",
		parentTables: [],
		rowStruct: "/Script/Fixture.Row",
		rows: [
			{
				fields: [
					{ name: "Count", typeName: "IntProperty", value: { kind: "int", value: "12" } },
					{
						name: "Enabled",
						typeName: "BoolProperty",
						value: { kind: "bool", value: true }
					}
				],
				id: "row:Alpha",
				name: "Alpha"
			},
			{
				fields: [
					{
						name: "Enabled",
						typeName: "BoolProperty",
						value: { kind: "bool", value: false }
					},
					{
						name: "Note",
						typeName: "StrProperty",
						value: { kind: "string", value: "Bravo note" }
					}
				],
				id: "row:Bravo",
				name: "Bravo"
			}
		]
	}
};

describe("authoring table presentation", () => {
	it("derives a stable first-seen column order across sparse rows", () => {
		expect(tableColumns(snapshot)).toEqual([
			{ name: "Count", typeName: "IntProperty" },
			{ name: "Enabled", typeName: "BoolProperty" },
			{ name: "Note", typeName: "StrProperty" }
		]);
	});

	it("uses v2 schema order for an empty table", () => {
		const empty: AuthoringTableSnapshot = {
			authority: { kind: "project_files", packageName: "/Game/Fixture/DT_Empty" },
			completeness: "complete",
			contract: { name: "unreal-authoring", version: { major: 2, minor: 0 } },
			diagnostics: [],
			fingerprint: { reason: "Not computed", status: "unavailable" },
			producer: { name: "fixture", version: "1" },
			table: {
				kind: "data_table",
				objectPath: "/Game/Fixture/DT_Empty.DT_Empty",
				packageName: "/Game/Fixture/DT_Empty",
				parentTables: [],
				rowStruct: "/Script/Fixture.Row",
				rows: [],
				schema: {
					fields: [
						{
							annotations: {
								deprecated: false,
								displayName: "Count",
								readOnly: false
							},
							defaultValue: { status: "unknown" },
							editability: { kind: "editable" },
							id: "field:Count",
							name: "Count",
							presence: "required",
							type: { kind: "scalar", valueKind: "int" },
							typeName: "IntProperty"
						}
					],
					source: "saved_package",
					status: "available"
				}
			}
		};

		expect(tableColumns(empty)).toEqual([{ name: "Count", typeName: "IntProperty" }]);
	});

	it("filters by row names and formatted typed values", () => {
		expect(filterRows(snapshot.table.rows, "alpha").map((row) => row.name)).toEqual(["Alpha"]);
		expect(filterRows(snapshot.table.rows, "bravo note").map((row) => row.name)).toEqual([
			"Bravo"
		]);
	});

	it("formats nested values without discarding their shape", () => {
		expect(
			formatAuthoringValue({
				kind: "struct",
				fields: [
					{
						name: "Point",
						typeName: "Vector",
						value: { kind: "vector", x: 1, y: 2, z: 3 }
					}
				]
			})
		).toBe("Point: X 1 · Y 2 · Z 3");
	});
});
