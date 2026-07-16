import { it } from "@effect/vitest";
import { makeAssetReaderTestLayer, type AssetReaderShape } from "@ue-shed/unreal-assets";
import { Effect, Layer } from "effect";
import { expect } from "vitest";
import { makeLocalFilesTestLayer } from "../adapters/local-files.js";
import { makeWorkbenchConfigurationLayer } from "../workbench-config.js";
import { Showcase, ShowcaseLive } from "./showcase.js";

const stubReader = (source: "configured" | "path"): AssetReaderShape => ({
	discoverAssets: () => Effect.succeed([]),
	discoverTables: () =>
		Effect.succeed({ diagnostics: [], projectRoot: "", scannedAssets: 0, tables: [] }),
	readAsset: () => Effect.die("not used"),
	readTable: () => Effect.die("not used"),
	source: () => Effect.succeed(source)
});

it.effect("reports fixture configured when project and rules exist", () =>
	Effect.gen(function* () {
		const showcase = yield* Showcase;
		const context = yield* showcase.context();
		expect(context).toEqual({
			fixtureConfigured: true,
			projectRoot: "C:/FixtureProject",
			reader: "configured",
			ruleFile: "C:/rules.json"
		});
	}).pipe(
		Effect.provide(
			ShowcaseLive.pipe(
				Layer.provide(
					Layer.mergeAll(
						makeWorkbenchConfigurationLayer({
							authoringAsset: { status: "not_configured" },
							expectedProject: { status: "not_configured" },
							project: { status: "configured", projectRoot: "C:/FixtureProject" },
							remoteControlEndpoint: "http://127.0.0.1:30001",
							review: { status: "not_configured" },
							sourceCheckout: { status: "not_configured" },
							textureAuditRules: { status: "configured", path: "C:/rules.json" }
						}),
						makeAssetReaderTestLayer(stubReader("configured")),
						makeLocalFilesTestLayer(
							new Map([
								["C:/FixtureProject", new Uint8Array()],
								["C:/rules.json", new Uint8Array()]
							])
						)
					)
				)
			)
		)
	)
);

it.effect("reports fixture not configured when nothing is set", () =>
	Effect.gen(function* () {
		const showcase = yield* Showcase;
		const context = yield* showcase.context();
		expect(context).toEqual({ fixtureConfigured: false, reader: "path" });
	}).pipe(
		Effect.provide(
			ShowcaseLive.pipe(
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
						makeAssetReaderTestLayer(stubReader("path")),
						makeLocalFilesTestLayer()
					)
				)
			)
		)
	)
);

it.effect("reports fixture not configured when configured paths are missing on disk", () =>
	Effect.gen(function* () {
		const showcase = yield* Showcase;
		const context = yield* showcase.context();
		expect(context.fixtureConfigured).toBe(false);
	}).pipe(
		Effect.provide(
			ShowcaseLive.pipe(
				Layer.provide(
					Layer.mergeAll(
						makeWorkbenchConfigurationLayer({
							authoringAsset: { status: "not_configured" },
							expectedProject: { status: "not_configured" },
							project: { status: "configured", projectRoot: "C:/FixtureProject" },
							remoteControlEndpoint: "http://127.0.0.1:30001",
							review: { status: "not_configured" },
							sourceCheckout: { status: "not_configured" },
							textureAuditRules: { status: "configured", path: "C:/rules.json" }
						}),
						makeAssetReaderTestLayer(stubReader("configured")),
						makeLocalFilesTestLayer()
					)
				)
			)
		)
	)
);
