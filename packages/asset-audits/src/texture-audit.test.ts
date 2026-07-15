import { it } from "@effect/vitest";
import { Effect, Ref } from "effect";
import { expect } from "vitest";
import { makeAssetReaderTestLayer } from "@ue-shed/unreal-assets";
import {
	TextureAudit,
	TextureAuditLive,
	TextureAuditScanError,
	makeTextureAuditTestLayer
} from "./texture.js";

const unexpected = (operation: string) => Effect.die(new Error(`Unexpected ${operation} call`));

it.effect("routes texture scans through the TextureAudit service", () =>
	Effect.gen(function* () {
		const scanned = yield* Ref.make(false);
		const layer = makeTextureAuditTestLayer({
			scan: Effect.fn("TextureAudit.Test.scan")(function* () {
				yield* Ref.set(scanned, true);
				return {
					coverage: {
						discoveredPackages: 0,
						failedPackages: 0,
						inspectedPackages: 0,
						partialPackages: 0,
						textureAssets: 0
					},
					diagnostics: [],
					distributions: {
						compression: [],
						maximumDimension: [],
						sRGB: [],
						textureGroup: []
					},
					findings: [],
					records: [],
					ruleSetName: "test",
					schemaVersion: 1 as const,
					status: "complete" as const
				};
			})
		});

		yield* Effect.flatMap(TextureAudit, (service) =>
			service.scan({
				projectRoot: "C:/Fixture",
				ruleFile: "C:/rules.json"
			})
		).pipe(Effect.provide(layer));

		expect(yield* Ref.get(scanned)).toBe(true);
	})
);

it.effect("TextureAuditLive obtains AssetReader from context", () =>
	Effect.gen(function* () {
		const roots = yield* Ref.make<readonly string[]>([]);
		const reader = makeAssetReaderTestLayer({
			discoverAssets: Effect.fn("AssetReader.Test.discoverAssets")(function* (projectRoot) {
				yield* Ref.update(roots, (current) => [...current, projectRoot]);
				return [];
			}),
			discoverTables: () => unexpected("discoverTables"),
			readAsset: () => unexpected("readAsset"),
			readTable: () => unexpected("readTable"),
			source: () => Effect.succeed("configured")
		});

		const error = yield* Effect.flatMap(TextureAudit, (service) =>
			service.scan({
				projectRoot: "C:/Fixture",
				ruleFile: "C:/missing-rules.json"
			})
		).pipe(Effect.flip, Effect.provide(TextureAuditLive), Effect.provide(reader));

		expect(error).toBeInstanceOf(TextureAuditScanError);
		expect(error.code).toBe("invalid_rules");
		expect(yield* Ref.get(roots)).toEqual([]);
	})
);
