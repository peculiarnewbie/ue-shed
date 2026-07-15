import type { AuthoringRow } from "@ue-shed/protocol";
import { describe, expect, it } from "vitest";
import { buildReadOnlyAuthoringGridModel, toReadOnlyGridValue } from "./authoring-grid-model.js";

const rows: readonly AuthoringRow[] = [
	{
		fields: [
			{ name: "Enabled", typeName: "BoolProperty", value: { kind: "bool", value: true } },
			{
				name: "Count",
				typeName: "Int64Property",
				value: { kind: "int", value: "9223372036854775807" }
			}
		],
		id: "row:Primary",
		name: "Primary"
	},
	{
		fields: [
			{
				name: "Enabled",
				typeName: "BoolProperty",
				value: { kind: "bool", value: false }
			}
		],
		id: "row:Sparse",
		name: "Sparse"
	}
];

describe("read-only Peculiar Sheets model", () => {
	it("preserves stable row identity and sparse cells", () => {
		const model = buildReadOnlyAuthoringGridModel({
			columns: [
				{ name: "Enabled", typeName: "BoolProperty" },
				{ name: "Count", typeName: "Int64Property" }
			],
			rows
		});

		expect(model.rowKeys).toEqual(["row:Primary", "row:Sparse"]);
		expect(model.data).toEqual([
			[true, "9223372036854775807"],
			[false, null]
		]);
		expect(model.columns.map((column) => column.id)).toEqual(["Enabled", "Count"]);
		expect(model.columns.every((column) => column.editable === false)).toBe(true);
	});

	it("formats rich values without collapsing them into JavaScript numbers", () => {
		expect(toReadOnlyGridValue({ kind: "int", value: "9223372036854775807" })).toBe(
			"9223372036854775807"
		);
		expect(
			toReadOnlyGridValue({
				kind: "struct",
				fields: [
					{ name: "X", typeName: "DoubleProperty", value: { kind: "double", value: 1 } }
				]
			})
		).toBe("X: 1");
	});
});
