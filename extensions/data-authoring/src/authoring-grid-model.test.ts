import type { AuthoringRow } from "@ue-shed/protocol";
import type { CellMutation } from "peculiar-sheets";
import { describe, expect, it } from "vitest";
import {
	buildReadOnlyAuthoringGridModel,
	decodeAuthoringGridMutation,
	toReadOnlyGridValue
} from "./authoring-grid-model.js";

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

	it("decodes exact integer edits without converting through JavaScript numbers", () => {
		const result = decodeAuthoringGridMutation({
			columns: [
				{
					descriptor: {
						annotations: { deprecated: false, readOnly: false },
						defaultValue: { status: "unknown" },
						editability: { kind: "editable" },
						id: "field:Count",
						name: "Count",
						presence: "required",
						type: { kind: "scalar", valueKind: "int" },
						typeName: "Int64Property"
					},
					name: "Count",
					typeName: "Int64Property"
				}
			],
			mutation: {
				address: { col: 0, row: 0 } as CellMutation["address"],
				columnId: "Count",
				newValue: "90071992547409931234",
				oldValue: "9223372036854775807",
				source: "paste"
			},
			rows
		});
		expect(result).toEqual({
			edit: {
				fieldName: "Count",
				rowId: "row:Primary",
				value: { kind: "int", value: "90071992547409931234" }
			},
			status: "ready"
		});
	});

	it("rejects edits to fields without editable schema evidence", () => {
		const result = decodeAuthoringGridMutation({
			columns: [{ name: "Count", typeName: "Int64Property" }],
			mutation: {
				address: { col: 0, row: 0 } as CellMutation["address"],
				columnId: "Count",
				newValue: "2",
				oldValue: "1",
				source: "user"
			},
			rows
		});
		expect(result.status).toBe("failed");
	});
});
