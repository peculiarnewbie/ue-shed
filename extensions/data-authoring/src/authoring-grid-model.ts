import type { AuthoringRow, AuthoringValue } from "@ue-shed/protocol";
import type { CellMutation, CellValue, ColumnDef } from "peculiar-sheets";
import type { AuthoringColumn } from "./authoring-view.js";
import { fieldInRow, formatAuthoringValue } from "./authoring-view.js";

export interface ReadOnlyAuthoringGridModel {
	readonly columns: ColumnDef[];
	readonly data: CellValue[][];
	readonly rowKeys: string[];
}

export interface AuthoringGridEdit {
	readonly fieldName: string;
	readonly rowId: string;
	readonly value: AuthoringValue;
}

export type AuthoringGridDecodeResult =
	| { readonly status: "ready"; readonly edit: AuthoringGridEdit }
	| { readonly status: "failed"; readonly message: string };

function isEditable(column: AuthoringColumn): boolean {
	const descriptor = column.descriptor;
	if (!descriptor || descriptor.editability.kind !== "editable") return false;
	switch (descriptor.type.kind) {
		case "scalar":
			return descriptor.type.valueKind !== "text";
		case "enum":
		case "reference":
			return true;
		default:
			return false;
	}
}

function parseEditorText(text: string, context: { readonly previousValue: CellValue }): CellValue {
	if (typeof context.previousValue === "boolean") {
		if (text.toLocaleLowerCase() === "true") return true;
		if (text.toLocaleLowerCase() === "false") return false;
	}
	return text;
}

function decodeValue(current: AuthoringValue, input: CellValue): AuthoringValue | undefined {
	switch (current.kind) {
		case "bool":
			if (typeof input === "boolean") return { kind: "bool", value: input };
			if (typeof input === "string" && /^(true|false)$/i.test(input.trim())) {
				return { kind: "bool", value: input.trim().toLocaleLowerCase() === "true" };
			}
			return undefined;
		case "int": {
			const value = String(input ?? "").trim();
			return /^-?\d+$/.test(value) ? { kind: "int", value } : undefined;
		}
		case "uint": {
			const value = String(input ?? "").trim();
			return /^\d+$/.test(value) ? { kind: "uint", value } : undefined;
		}
		case "float":
		case "double": {
			const value = typeof input === "number" ? input : Number(input);
			return Number.isFinite(value) ? { kind: current.kind, value } : undefined;
		}
		case "name":
		case "enum":
		case "string":
		case "guid":
		case "soft_object_path":
			return typeof input === "string" ? { kind: current.kind, value: input } : undefined;
		case "object_ref":
			return input === null || input === ""
				? { kind: "object_ref", value: null }
				: typeof input === "string"
					? { kind: "object_ref", value: input }
					: undefined;
		default:
			return undefined;
	}
}

export function decodeAuthoringGridMutation(args: {
	readonly mutation: CellMutation;
	readonly rows: readonly AuthoringRow[];
	readonly columns: readonly AuthoringColumn[];
}): AuthoringGridDecodeResult {
	const row = args.rows[args.mutation.address.row];
	const column = args.columns.find((candidate) => candidate.name === args.mutation.columnId);
	if (!row || !column)
		return { message: "The edited cell is outside the table.", status: "failed" };
	if (!isEditable(column)) {
		return { message: `${column.name} is read-only for this authority.`, status: "failed" };
	}
	const field = fieldInRow(row, column.name);
	if (!field)
		return { message: `${row.name}.${column.name} has no typed value.`, status: "failed" };
	const value = decodeValue(field.value, args.mutation.newValue);
	if (!value) {
		return {
			message: `${String(args.mutation.newValue)} is not valid for ${column.typeName}.`,
			status: "failed"
		};
	}
	if (column.descriptor?.type.kind === "enum") {
		const choices = column.descriptor.type.options.map(({ name }) => name);
		if (value.kind !== "enum" || !choices.includes(value.value)) {
			return { message: `Choose one of: ${choices.join(", ")}.`, status: "failed" };
		}
	}
	return { edit: { fieldName: column.name, rowId: row.id, value }, status: "ready" };
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
			editable: isEditable(column),
			getCellTitle: (value) => (value === null ? undefined : String(value)),
			header: column.name,
			id: column.name,
			meta: { typeName: column.typeName },
			minWidth: 140,
			parseValue: parseEditorText,
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
