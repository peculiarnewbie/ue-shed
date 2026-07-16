import { it } from "@effect/vitest";
import { makeTextureAuditTestLayer, TextureAuditScanError } from "@ue-shed/asset-audits";
import {
	makeRemoteControlClientTestLayer,
	RemoteControlClientError
} from "@ue-shed/unreal-connection";
import { Effect, Layer } from "effect";
import { expect } from "vitest";
import { makeElectronDialogTestLayer } from "../adapters/electron-dialog.js";
import { makeWorkbenchWindowTestLayer } from "../adapters/electron-window.js";
import { makeWorkbenchConfigurationLayer } from "../workbench-config.js";
import { WorkbenchAssetAudits, WorkbenchAssetAuditsLive } from "./asset-audits.js";

const emptyReport = {
	coverage: {
		discoveredPackages: 0,
		failedPackages: 0,
		inspectedPackages: 0,
		partialPackages: 0,
		textureAssets: 0
	},
	diagnostics: [],
	distributions: { compression: [], maximumDimension: [], sRGB: [], textureGroup: [] },
	findings: [],
	records: [],
	ruleSetName: "test",
	schemaVersion: 1 as const,
	status: "complete" as const
};

const configuration = makeWorkbenchConfigurationLayer({
	authoringAsset: { status: "not_configured" },
	expectedProject: { status: "not_configured" },
	project: { status: "configured", projectRoot: "C:/FixtureProject" },
	remoteControlEndpoint: "http://127.0.0.1:30001",
	review: { status: "not_configured" },
	sourceCheckout: { status: "not_configured" },
	textureAuditRules: { status: "configured", path: "C:/rules.json" }
});

const dialogLayer = (openDialog: Parameters<typeof makeWorkbenchWindowTestLayer>[0]) =>
	makeElectronDialogTestLayer.pipe(Layer.provide(makeWorkbenchWindowTestLayer(openDialog)));

it.effect("returns not_configured when project or rules are absent", () =>
	Effect.gen(function* () {
		const service = yield* WorkbenchAssetAudits;
		const result = yield* service.configuredScan();
		expect(result).toEqual({ status: "not_configured" });
	}).pipe(
		Effect.provide(
			WorkbenchAssetAuditsLive.pipe(
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
						makeTextureAuditTestLayer({ scan: () => Effect.die("not used") }),
						dialogLayer({}),
						makeRemoteControlClientTestLayer(() => Effect.die("not used"))
					)
				)
			)
		)
	)
);

it.effect("scans the configured project and rules", () =>
	Effect.gen(function* () {
		const service = yield* WorkbenchAssetAudits;
		const result = yield* service.configuredScan();
		expect(result).toEqual({ report: emptyReport, status: "completed" });
	}).pipe(
		Effect.provide(
			WorkbenchAssetAuditsLive.pipe(
				Layer.provide(
					Layer.mergeAll(
						configuration,
						makeTextureAuditTestLayer({ scan: () => Effect.succeed(emptyReport) }),
						dialogLayer({}),
						makeRemoteControlClientTestLayer(() => Effect.die("not used"))
					)
				)
			)
		)
	)
);

it.effect("translates a typed scan failure into the failed result variant", () =>
	Effect.gen(function* () {
		const service = yield* WorkbenchAssetAudits;
		const result = yield* service.configuredScan();
		expect(result).toEqual({
			error: {
				code: "scan_failed",
				message: "boom",
				recovery: "retry",
				retrySafe: false
			},
			status: "failed"
		});
	}).pipe(
		Effect.provide(
			WorkbenchAssetAuditsLive.pipe(
				Layer.provide(
					Layer.mergeAll(
						configuration,
						makeTextureAuditTestLayer({
							scan: () =>
								Effect.fail(
									new TextureAuditScanError({
										code: "scan_failed",
										message: "boom",
										recovery: "retry",
										retrySafe: false
									})
								)
						}),
						dialogLayer({}),
						makeRemoteControlClientTestLayer(() => Effect.die("not used"))
					)
				)
			)
		)
	)
);

it.effect("cancels choose-and-scan when the project dialog is cancelled", () =>
	Effect.gen(function* () {
		const service = yield* WorkbenchAssetAudits;
		const result = yield* service.chooseAndScan();
		expect(result).toEqual({ status: "cancelled" });
	}).pipe(
		Effect.provide(
			WorkbenchAssetAuditsLive.pipe(
				Layer.provide(
					Layer.mergeAll(
						configuration,
						makeTextureAuditTestLayer({ scan: () => Effect.die("not used") }),
						dialogLayer({
							openDialog: Effect.fn("test.openDialog")(() =>
								Effect.succeed({ status: "cancelled" as const })
							)
						}),
						makeRemoteControlClientTestLayer(() => Effect.die("not used"))
					)
				)
			)
		)
	)
);

it.effect("reports live preview unavailable when Remote Control fails", () =>
	Effect.gen(function* () {
		const service = yield* WorkbenchAssetAudits;
		const result = yield* service.preview("/Game/Texture.Texture");
		expect(result.status).toBe("unavailable");
		if (result.status === "unavailable") {
			expect(result.reason).toBe("not_connected");
			expect(result.objectPath).toBe("/Game/Texture.Texture");
		}
	}).pipe(
		Effect.provide(
			WorkbenchAssetAuditsLive.pipe(
				Layer.provide(
					Layer.mergeAll(
						configuration,
						makeTextureAuditTestLayer({ scan: () => Effect.die("not used") }),
						dialogLayer({}),
						makeRemoteControlClientTestLayer(() =>
							Effect.fail(
								new RemoteControlClientError({
									endpoint: "http://127.0.0.1:30001",
									functionName: "GetCapabilityManifest",
									message: "Remote Control unreachable",
									operation: "asset_audits.live_manifest",
									retrySafe: true
								})
							)
						)
					)
				)
			)
		)
	)
);
