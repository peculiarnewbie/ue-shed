import * as stylex from "@stylexjs/stylex";
import { tokens } from "@ue-shed/ui-theme/tokens.stylex.js";
import { splitProps, type ComponentProps, type ParentProps } from "solid-js";

export type ButtonProps = ParentProps<
	Omit<ComponentProps<"button">, "class" | "classList" | "style"> & {
		readonly tone?: "primary" | "secondary" | "quiet";
	}
>;

export function Button(props: ButtonProps) {
	const [local, buttonProps] = splitProps(props, ["children", "tone"]);
	return (
		<button
			{...buttonProps}
			{...stylex.props(
				styles.base,
				local.tone === "primary"
					? styles.primary
					: local.tone === "quiet"
						? styles.quiet
						: styles.secondary
			)}
		>
			{local.children}
		</button>
	);
}

const styles = stylex.create({
	base: {
		borderRadius: tokens.radiusControl,
		cursor: "pointer",
		fontFamily: tokens.fontBody,
		fontSize: 10,
		fontWeight: 700,
		letterSpacing: ".08em",
		padding: "10px 15px",
		textTransform: "uppercase",
		transitionDuration: tokens.motionFast,
		transitionProperty: "background-color, border-color, color"
	},
	primary: {
		backgroundColor: { default: tokens.colorAccent, ":hover": tokens.colorAccentStrong },
		borderColor: tokens.colorAccent,
		borderStyle: "solid",
		borderWidth: 1,
		color: tokens.colorAccentText
	},
	quiet: {
		backgroundColor: { default: "transparent", ":hover": tokens.colorSurfaceHover },
		borderColor: "transparent",
		borderStyle: "solid",
		borderWidth: 1,
		color: tokens.colorTextMuted
	},
	secondary: {
		backgroundColor: { default: tokens.colorSurface, ":hover": tokens.colorSurfaceHover },
		borderColor: tokens.colorBorderInteractive,
		borderStyle: "solid",
		borderWidth: 1,
		color: tokens.colorText
	}
});
