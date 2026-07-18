import type { EditorPlaySessionCommand } from "@ue-shed/protocol";
import { EditorPlaySession } from "@ue-shed/engine-discovery";
import { Effect } from "effect";
import { ElectronIpc } from "../adapters/electron-ipc.js";
import { invokeContracts } from "../ipc-contracts.js";
import { WorkbenchConfiguration } from "../workbench-config.js";

export const register = Effect.gen(function* () {
	const ipc = yield* ElectronIpc;
	const editorSession = yield* EditorPlaySession;
	const configuration = yield* WorkbenchConfiguration;
	const endpoint = configuration.remoteControlEndpoint;

	yield* ipc.register(invokeContracts["editor-session:status"], () =>
		editorSession.status(endpoint).pipe(Effect.orDie)
	);
	yield* ipc.register(invokeContracts["editor-session:execute"], (...args) => {
		const [command] = args as [EditorPlaySessionCommand];
		return editorSession.execute(endpoint, command).pipe(Effect.orDie);
	});
}).pipe(Effect.withSpan("Workbench.Ipc.registerEditorSession"));
