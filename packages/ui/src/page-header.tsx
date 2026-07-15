import * as stylex from "@stylexjs/stylex";
import { tokens } from "@ue-shed/ui-theme/tokens.stylex.js";
import type { JSX } from "solid-js";

export interface PageHeaderProps {
	readonly eyebrow: string;
	readonly title: string;
	readonly description: string;
	readonly actions?: JSX.Element;
}

export function PageHeader(props: PageHeaderProps) {
	return (
		<header {...stylex.props(styles.header)}>
			<div>
				<div {...stylex.props(styles.eyebrow)}>{props.eyebrow}</div>
				<h1 {...stylex.props(styles.title)}>{props.title}</h1>
				<p {...stylex.props(styles.description)}>{props.description}</p>
			</div>
			{props.actions ? <div {...stylex.props(styles.actions)}>{props.actions}</div> : null}
		</header>
	);
}

const styles = stylex.create({
	actions: { display: "flex", gap: tokens.space2 },
	description: {
		color: tokens.colorTextMuted,
		fontSize: 11,
		lineHeight: 1.6,
		margin: "8px 0 0"
	},
	eyebrow: {
		color: tokens.colorTextMuted,
		fontSize: 9,
		letterSpacing: ".18em",
		marginBottom: 10
	},
	header: {
		alignItems: "end",
		display: "flex",
		gap: tokens.space6,
		justifyContent: "space-between",
		paddingBottom: 26
	},
	title: {
		color: tokens.colorText,
		fontFamily: tokens.fontDisplay,
		fontSize: 46,
		fontWeight: 400,
		letterSpacing: "-.035em",
		margin: 0
	}
});
