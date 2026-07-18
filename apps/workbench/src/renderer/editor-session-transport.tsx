import * as stylex from "@stylexjs/stylex";
import type { EditorPlaySessionCommand } from "@ue-shed/protocol";
import { createEffectAction, createEffectSubscription } from "@ue-shed/ui";
import { tokens } from "@ue-shed/ui-theme/tokens.stylex.js";
import { Exit } from "effect";
import { For, createMemo, createSignal, onMount } from "solid-js";
import type { WorkbenchRendererClient } from "./workbench-client.js";
import {
	editorSessionTransportActions,
	editorSessionTransportLabel,
	type EditorSessionTransportState
} from "./editor-session-transport-model.js";

export function EditorSessionTransport(props: { readonly client: WorkbenchRendererClient }) {
	const action = createEffectAction();
	const subscription = createEffectSubscription();
	const [state, setState] = createSignal<EditorSessionTransportState>({ status: "offline" });
	const [pending, setPending] = createSignal(false);
	const [message, setMessage] = createSignal<string>();
	const actions = createMemo(() => editorSessionTransportActions(state()));

	onMount(() => {
		subscription.subscribe(props.client.editorSessionStatuses, {
			onValue: (exit) => {
				if (Exit.isSuccess(exit)) {
					setState(exit.value.state);
					setMessage(undefined);
				} else {
					setState({ status: "offline" });
				}
			}
		});
	});

	const execute = (command: EditorPlaySessionCommand) => {
		setPending(true);
		setMessage(undefined);
		action.run(props.client.executeEditorSessionCommand(command), {
			onFailure: () => {
				setPending(false);
				setMessage("COMMAND FAILED");
			},
			onSuccess: (result) => {
				setPending(false);
				setState(result.state);
				setMessage(result.outcome === "rejected" ? result.message : undefined);
			}
		});
	};

	return (
		<section
			aria-label="Editor play session"
			title={message()}
			{...stylex.props(styles.transport)}
		>
			<span
				aria-hidden="true"
				{...stylex.props(
					styles.lamp,
					state().status === "running" && styles.live,
					state().status === "paused" && styles.paused
				)}
			/>
			<span {...stylex.props(styles.label)}>{editorSessionTransportLabel(state())}</span>
			<div {...stylex.props(styles.actions)}>
				<For each={actions()}>
					{(item) => (
						<button
							type="button"
							disabled={pending()}
							onClick={() => execute(item.command)}
							{...stylex.props(styles.button, item.primary && styles.primary)}
						>
							{item.label}
						</button>
					)}
				</For>
			</div>
		</section>
	);
}

const styles = stylex.create({
	transport: {
		marginLeft: "auto",
		height: "100%",
		display: "flex",
		alignItems: "center",
		gap: 7,
		padding: "0 10px",
		borderLeft: `1px solid ${tokens.colorBorder}`,
		borderRight: `1px solid ${tokens.colorBorder}`
	},
	lamp: { width: 6, height: 6, borderRadius: "50%", backgroundColor: "#59615b" },
	live: { backgroundColor: tokens.colorAccent, boxShadow: "0 0 8px #b8ff5566" },
	paused: { backgroundColor: "#d89a53", boxShadow: "0 0 8px #d89a5355" },
	label: {
		minWidth: 78,
		color: tokens.colorTextSubtle,
		fontSize: 8,
		letterSpacing: ".09em",
		whiteSpace: "nowrap"
	},
	actions: { display: "flex", gap: 3 },
	button: {
		minWidth: 42,
		height: 24,
		padding: "0 7px",
		border: `1px solid ${tokens.colorBorder}`,
		backgroundColor: { default: "transparent", ":hover": "#242a26" },
		color: tokens.colorTextSubtle,
		fontFamily: tokens.fontBody,
		fontSize: 8,
		letterSpacing: ".08em",
		cursor: { default: "pointer", ":disabled": "wait" },
		opacity: { default: 1, ":disabled": 0.45 }
	},
	primary: {
		borderColor: tokens.colorAccent,
		color: tokens.colorAccent
	}
});
