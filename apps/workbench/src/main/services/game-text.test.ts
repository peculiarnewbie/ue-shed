import { it } from "@effect/vitest";
import { makeTextCorpusServiceTestLayer, TextCorpusScanError } from "@ue-shed/game-text";
import { Effect, Layer } from "effect";
import { expect } from "vitest";
import { makeElectronDialogTestLayer } from "../adapters/electron-dialog.js";
import { makeWorkbenchWindowTestLayer } from "../adapters/electron-window.js";
import { makeWorkbenchConfigurationLayer } from "../workbench-config.js";
import { WorkbenchGameText, WorkbenchGameTextLive } from "./game-text.js";

const emptyCorpus = {
	coverage: {
		discoveredPackages: 0,
		failedPackages: 0,
		inspectedPackages: 0,
		partialPackages: 0,
		resolvedOccurrences: 0,
		textOccurrences: 0,
		textUnits: 0,
		unresolvedOccurrences: 0,
		unsupportedTextProperties: 0
	},
	diagnostics: [],
	schemaVersion: 1 as const,
	status: "complete" as const,
	units: []
};

const configuration = makeWorkbenchConfigurationLayer({
	authoringAsset: { status: "not_configured" },
	expectedProject: { status: "not_configured" },
	project: { status: "configured", projectRoot: "C:/FixtureProject" },
	remoteControlEndpoint: "http://127.0.0.1:30001",
	review: { status: "not_configured" },
	sourceCheckout: { status: "not_configured" },
	textureAuditRules: { status: "not_configured" }
});

const dialogLayer = (openDialog: Parameters<typeof makeWorkbenchWindowTestLayer>[0]) =>
	makeElectronDialogTestLayer.pipe(Layer.provide(makeWorkbenchWindowTestLayer(openDialog)));

it.effect("returns not_configured without a project root", () =>
	Effect.gen(function* () {
		const service = yield* WorkbenchGameText;
		const result = yield* service.configuredScan();
		expect(result).toEqual({ status: "not_configured" });
	}).pipe(
		Effect.provide(
			WorkbenchGameTextLive.pipe(
				Layer.provide(
					Layer.mergeAll(
						makeWorkbenchConfigurationLayer({
							authoringAsset: { status: "not_configured" },
							expectedProject: { status: "not_configured" },
							project: { status: "not_configured" },
							remoteControlEndpoint: "http://127.0.0.1:30001",
							review: { status: "not_configured" },
							sourceCheckout: { status: "not_configured" },
							textureAuditRules: { status: "not_configured" }
						}),
						makeTextCorpusServiceTestLayer({ scan: () => Effect.die("not used") }),
						dialogLayer({})
					)
				)
			)
		)
	)
);

it.effect("scans the configured project", () =>
	Effect.gen(function* () {
		const service = yield* WorkbenchGameText;
		const result = yield* service.configuredScan();
		expect(result).toEqual({ corpus: emptyCorpus, status: "completed" });
	}).pipe(
		Effect.provide(
			WorkbenchGameTextLive.pipe(
				Layer.provide(
					Layer.mergeAll(
						configuration,
						makeTextCorpusServiceTestLayer({ scan: () => Effect.succeed(emptyCorpus) }),
						dialogLayer({})
					)
				)
			)
		)
	)
);

it.effect("translates a typed scan failure into the failed result variant", () =>
	Effect.gen(function* () {
		const service = yield* WorkbenchGameText;
		const result = yield* service.configuredScan();
		expect(result).toEqual({
			error: {
				code: "invalid_project",
				message: "boom",
				recovery: "retry",
				retrySafe: false
			},
			status: "failed"
		});
	}).pipe(
		Effect.provide(
			WorkbenchGameTextLive.pipe(
				Layer.provide(
					Layer.mergeAll(
						configuration,
						makeTextCorpusServiceTestLayer({
							scan: () =>
								Effect.fail(
									new TextCorpusScanError({
										code: "invalid_project",
										message: "boom",
										recovery: "retry",
										retrySafe: false
									})
								)
						}),
						dialogLayer({})
					)
				)
			)
		)
	)
);

it.effect("chooses a project directory then scans it", () =>
	Effect.gen(function* () {
		const service = yield* WorkbenchGameText;
		const result = yield* service.chooseAndScan();
		expect(result).toEqual({ corpus: emptyCorpus, status: "completed" });
	}).pipe(
		Effect.provide(
			WorkbenchGameTextLive.pipe(
				Layer.provide(
					Layer.mergeAll(
						configuration,
						makeTextCorpusServiceTestLayer({ scan: () => Effect.succeed(emptyCorpus) }),
						dialogLayer({
							openDialog: Effect.fn("test.openDialog")(() =>
								Effect.succeed({
									path: "C:/ChosenProject",
									status: "selected" as const
								})
							)
						})
					)
				)
			)
		)
	)
);

it.effect("cancels choose-and-scan when the dialog is cancelled", () =>
	Effect.gen(function* () {
		const service = yield* WorkbenchGameText;
		const result = yield* service.chooseAndScan();
		expect(result).toEqual({ status: "cancelled" });
	}).pipe(
		Effect.provide(
			WorkbenchGameTextLive.pipe(
				Layer.provide(
					Layer.mergeAll(
						configuration,
						makeTextCorpusServiceTestLayer({ scan: () => Effect.die("not used") }),
						dialogLayer({
							openDialog: Effect.fn("test.openDialog")(() =>
								Effect.succeed({ status: "cancelled" as const })
							)
						})
					)
				)
			)
		)
	)
);
