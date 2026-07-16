import { TextCorpusService, type TextCorpusRunResult } from "@ue-shed/game-text";
import { Context, Effect, Layer } from "effect";
import { ElectronDialog } from "../adapters/electron-dialog.js";
import type { WorkbenchWindowError } from "../adapters/electron-window.js";
import { WorkbenchConfiguration } from "../workbench-config.js";

export interface WorkbenchGameTextShape {
	readonly chooseAndScan: () => Effect.Effect<TextCorpusRunResult, WorkbenchWindowError>;
	readonly configuredScan: () => Effect.Effect<TextCorpusRunResult>;
}

export class WorkbenchGameText extends Context.Service<WorkbenchGameText, WorkbenchGameTextShape>()(
	"@ue-shed/workbench/WorkbenchGameText"
) {}

export const WorkbenchGameTextLive = Layer.effect(
	WorkbenchGameText,
	Effect.gen(function* () {
		const configuration = yield* WorkbenchConfiguration;
		const dialog = yield* ElectronDialog;
		const textCorpus = yield* TextCorpusService;

		const runScan = (projectRoot: string) =>
			textCorpus.scan({ projectRoot }).pipe(
				Effect.map((corpus) => ({ corpus, status: "completed" as const })),
				Effect.catch((error) =>
					Effect.succeed({
						error: {
							code: error.code,
							message: error.message,
							recovery: error.recovery,
							retrySafe: error.retrySafe
						},
						status: "failed" as const
					})
				)
			);

		const configuredScan = Effect.fn("Workbench.WorkbenchGameText.configuredScan")(
			function* () {
				if (configuration.project.status !== "configured") {
					return { status: "not_configured" as const };
				}
				return yield* runScan(configuration.project.projectRoot);
			}
		);

		const chooseAndScan = Effect.fn("Workbench.WorkbenchGameText.chooseAndScan")(function* () {
			const choice = yield* dialog.chooseDirectory({
				title: "Choose an Unreal project for Game Text"
			});
			if (choice.status === "cancelled") return { status: "cancelled" as const };
			return yield* runScan(choice.path);
		});

		return WorkbenchGameText.of({ chooseAndScan, configuredScan });
	})
);

export function makeWorkbenchGameTextTestLayer(
	service: WorkbenchGameTextShape
): Layer.Layer<WorkbenchGameText> {
	return Layer.succeed(WorkbenchGameText, WorkbenchGameText.of(service));
}
