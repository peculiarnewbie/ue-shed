import { AssetReader } from "@ue-shed/unreal-assets";
import { Context, Effect, Layer } from "effect";
import { LocalFiles } from "../adapters/local-files.js";
import type { ShowcaseContext } from "../ipc-contracts.js";
import { WorkbenchConfiguration } from "../workbench-config.js";

export interface ShowcaseShape {
	readonly context: () => Effect.Effect<ShowcaseContext>;
}

export class Showcase extends Context.Service<Showcase, ShowcaseShape>()(
	"@ue-shed/workbench/Showcase"
) {}

export const ShowcaseLive = Layer.effect(
	Showcase,
	Effect.gen(function* () {
		const configuration = yield* WorkbenchConfiguration;
		const assetReader = yield* AssetReader;
		const localFiles = yield* LocalFiles;

		const context = Effect.fn("Workbench.Showcase.context")(function* () {
			const reader = yield* assetReader.source();
			const projectRoot =
				configuration.project.status === "configured"
					? configuration.project.projectRoot
					: undefined;
			const ruleFile =
				configuration.textureAuditRules.status === "configured"
					? configuration.textureAuditRules.path
					: undefined;
			const projectExists = projectRoot ? yield* localFiles.exists(projectRoot) : false;
			const ruleFileExists = ruleFile ? yield* localFiles.exists(ruleFile) : false;
			return {
				fixtureConfigured: Boolean(
					projectRoot && ruleFile && projectExists && ruleFileExists
				),
				...(projectRoot ? { projectRoot } : {}),
				reader,
				...(ruleFile ? { ruleFile } : {})
			} satisfies ShowcaseContext;
		});

		return Showcase.of({ context });
	})
);

export function makeShowcaseTestLayer(service: ShowcaseShape): Layer.Layer<Showcase> {
	return Layer.succeed(Showcase, Showcase.of(service));
}
