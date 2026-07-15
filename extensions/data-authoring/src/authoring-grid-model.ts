import type { AuthoringRow, AuthoringValue } from "@ue-shed/protocol";
import type { CellValue, ColumnDef } from "peculiar-sheets";
import type { AuthoringColumn } from "./authoring-view.js";
import { fieldInRow, formatAuthoringValue } from "./authoring-view.js";

export interface ReadOnlyAuthoringGridModel {
	readonly columns: ColumnDef[];
	readonly data: CellValue[][];
	readonly rowKeys: string[];
}

export function toReadOnlyGridValue(value: AuthoringValue): CellValue {
	switch (value.kind) {
		case "bool":
			return value.value;
		case "object_ref":
			return value.value;
		default:
			return formatAuthoringValue(value);
	}
}

export function buildReadOnlyAuthoringGridModel(args: {
	readonly rows: readonly AuthoringRow[];
	readonly columns: readonly AuthoringColumn[];
}): ReadOnlyAuthoringGridModel {
	return {
		columns: args.columns.map((column) => ({
			editable: false,
			getCellTitle: (value) => (value === null ? undefined : String(value)),
			header: column.name,
			id: column.name,
			meta: { typeName: column.typeName },
			minWidth: 140,
			resizable: true,
			sortable: false,
			width: 190
		})),
		data: args.rows.map((row) =>
			args.columns.map((column) => {
				const field = fieldInRow(row, column.name);
				return field ? toReadOnlyGridValue(field.value) : null;
			})
		),
		rowKeys: args.rows.map((row) => row.id)
	};
}
