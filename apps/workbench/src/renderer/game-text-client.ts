import { decodeTextCorpusRunResult, type TextCorpusRunResult } from "@ue-shed/game-text/browser";
import {
	GameTextClient,
	GameTextClientError,
	type GameTextClientShape
} from "@ue-shed/extension-game-text";
import { Effect } from "effect";

const recovery = "Restart Workbench. If the problem persists, verify package versions.";

function request(
	operation: string,
	invoke: () => Promise<unknown>
): Effect.Effect<TextCorpusRunResult, GameTextClientError> {
	return Effect.tryPromise({
		try: invoke,
		catch: (cause) => new GameTextClientError({ cause, operation, recovery })
	}).pipe(
		Effect.flatMap(decodeTextCorpusRunResult),
		Effect.mapError((cause) => new GameTextClientError({ cause, operation, recovery }))
	);
}

export const gameTextClient: GameTextClientShape = GameTextClient.of({
	loadConfiguredProject: Effect.fn("GameTextClient.loadConfiguredProject")(() =>
		request("gameText.loadConfiguredProject", () =>
			window.ueShed.gameText.loadConfiguredProject()
		)
	),
	chooseProjectAndScan: Effect.fn("GameTextClient.chooseProjectAndScan")(() =>
		request("gameText.chooseProjectAndScan", () =>
			window.ueShed.gameText.chooseProjectAndScan()
		)
	)
});
