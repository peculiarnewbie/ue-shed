import * as stylex from "@stylexjs/stylex";
import type { AuthoringRow } from "@ue-shed/protocol";
import { Sheet, rowId, type Selection } from "peculiar-sheets";
import "peculiar-sheets/styles";
import { createMemo } from "solid-js";
import { buildReadOnlyAuthoringGridModel } from "./authoring-grid-model.js";
import type { AuthoringColumn } from "./authoring-view.js";

export interface AuthoringGridSelection {
	readonly fieldName: string;
	readonly rowId: string;
}

export interface AuthoringTableGridProps {
	readonly rows: readonly AuthoringRow[];
	readonly columns: readonly AuthoringColumn[];
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

	return (
		<div {...stylex.props(styles.frame)}>
			<Sheet
				columns={model().columns}
				customization={{
					getRowHeaderLabel: (index) => props.rows[index]?.name ?? String(index + 1),
					getRowHeaderSublabel: () => "ROW"
				}}
				data={model().data}
				onSelectionChange={handleSelection}
				readOnly
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
		backgroundColor: "#111410",
		borderColor: "#30372f",
		borderRadius: 2,
		borderStyle: "solid",
		borderWidth: 1,
		height: "min(68vh, 760px)",
		minHeight: 420,
		overflow: "hidden"
	}
});
