import * as stylex from "@stylexjs/stylex";
import type { AuthoringRow } from "@ue-shed/protocol";
import { tokens } from "@ue-shed/ui-theme/tokens.stylex.js";
import { Sheet, rowId, type Selection, type SheetOperation } from "peculiar-sheets";
import "peculiar-sheets/styles";
import { createMemo } from "solid-js";
import {
	buildReadOnlyAuthoringGridModel,
	decodeAuthoringGridMutation,
	type AuthoringGridEdit
} from "./authoring-grid-model.js";
import type { AuthoringColumn } from "./authoring-view.js";

export interface AuthoringGridSelection {
	readonly fieldName: string;
	readonly rowId: string;
}

export interface AuthoringTableGridProps {
	readonly rows: readonly AuthoringRow[];
	readonly columns: readonly AuthoringColumn[];
	readonly disabled?: boolean;
	readonly onEditGesture?: (edits: readonly AuthoringGridEdit[]) => void;
	readonly onEditFailure?: (message: string) => void;
	readonly onSelectionChange?: (selection: AuthoringGridSelection | undefined) => void;
}

export function AuthoringTableGrid(props: AuthoringTableGridProps) {
	const model = createMemo(() =>
		buildReadOnlyAuthoringGridModel({ columns: props.columns, rows: props.rows })
	);

	const handleSelection = (selection: Selection) => {
		const row = props.rows[selection.focus.row];
		const column = props.columns[selection.focus.col];
		props.onSelectionChange?.(
			row && column ? { fieldName: column.name, rowId: row.id } : undefined
		);
	};

	const handleOperation = (operation: SheetOperation) => {
		const mutations =
			operation.type === "cell-edit"
				? [operation.mutation]
				: operation.type === "batch-edit"
					? operation.mutations
					: [];
		if (mutations.length === 0) return;
		const decoded = mutations.map((mutation) =>
			decodeAuthoringGridMutation({ columns: props.columns, mutation, rows: props.rows })
		);
		const failure = decoded.find((result) => result.status === "failed");
		if (failure?.status === "failed") {
			props.onEditFailure?.(failure.message);
			return;
		}
		props.onEditGesture?.(
			decoded.flatMap((result) => (result.status === "ready" ? [result.edit] : []))
		);
	};

	return (
		<div {...stylex.props(styles.frame)}>
			<Sheet
				columns={model().columns}
				customization={{
					getRowHeaderLabel: (index) => props.rows[index]?.name ?? String(index + 1),
					getRowHeaderSublabel: () => "ROW"
				}}
				data={model().data}
				onOperation={handleOperation}
				onSelectionChange={handleSelection}
				readOnly={props.disabled ?? false}
				rowIds={model().rowKeys.map(rowId)}
				showFormulaBar={false}
				showReferenceHeaders={false}
				sortBehavior="view"
			/>
		</div>
	);
}

const styles = stylex.create({
	frame: {
		backgroundColor: tokens.colorSurface,
		borderColor: tokens.colorBorder,
		borderRadius: tokens.radiusPanel,
		borderStyle: "solid",
		borderWidth: 1,
		height: "min(68vh, 760px)",
		minHeight: 420,
		overflow: "hidden"
	}
});
