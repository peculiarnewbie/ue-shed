import type { TextCorpusRunResult } from "@ue-shed/game-text/browser";
import { Context, type Effect, Schema } from "effect";

export class GameTextClientError extends Schema.TaggedErrorClass<GameTextClientError>()(
	"GameTextClientError",
	{
		cause: Schema.Defect(),
		operation: Schema.String,
		recovery: Schema.String
	}
) {}

export interface GameTextClientShape {
	readonly loadConfiguredProject: () => Effect.Effect<TextCorpusRunResult, GameTextClientError>;
	readonly chooseProjectAndScan: () => Effect.Effect<TextCorpusRunResult, GameTextClientError>;
}

export class GameTextClient extends Context.Service<GameTextClient, GameTextClientShape>()(
	"@ue-shed/extension-game-text/GameTextClient"
) {}
