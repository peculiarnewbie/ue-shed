import * as stylex from "@stylexjs/stylex";
import { tokens } from "@ue-shed/ui-theme/tokens.stylex.js";
import type { JSX } from "solid-js";

export interface PageHeaderProps {
	readonly eyebrow: string;
	readonly actions?: JSX.Element;
}

export function PageHeader(props: PageHeaderProps) {
	return (
		<header {...stylex.props(styles.header)}>
			<nav aria-label="Breadcrumb" {...stylex.props(styles.eyebrow)}>
				{props.eyebrow}
			</nav>
			{props.actions ? <div {...stylex.props(styles.actions)}>{props.actions}</div> : null}
		</header>
	);
}

const styles = stylex.create({
	actions: { display: "flex", gap: tokens.space2 },
	eyebrow: {
		color: tokens.colorTextMuted,
		fontSize: 9,
		letterSpacing: ".18em",
		textTransform: "uppercase"
	},
	header: {
		alignItems: "center",
		display: "flex",
		gap: tokens.space6,
		justifyContent: "space-between",
		paddingBottom: 16
	}
});
