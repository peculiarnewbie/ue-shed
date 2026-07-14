import {
	decodeCompanionCapabilityManifest,
	type CompanionCapabilityManifest
} from "@ue-shed/protocol";
import { Data, Effect, Schema } from "effect";
import { decodeTexturePreviewResult, type TexturePreviewResult } from "./schema.js";

const coreObjectPath = "/Script/UEShedCore.Default__UEShedCoreLibrary";
const previewCapability = "asset-audits.texture-preview.v1";
const RemoteCallEnvelope = Schema.Struct({ ResultJson: Schema.String });
const decodeRemoteCallEnvelope = Schema.decodeUnknownSync(RemoteCallEnvelope);

export class LiveTexturePreviewError extends Data.TaggedError("LiveTexturePreviewError")<{
	readonly endpoint: string;
	readonly operation: "manifest" | "preview";
	readonly message: string;
	readonly retrySafe: boolean;
	readonly status?: number;
}> {}

export interface LiveTexturePreviewOptions {
	readonly endpoint: string;
	readonly objectPath: string;
	readonly maxDimension?: number;
}

function unavailable(options: {
	readonly objectPath: string;
	readonly reason: "capability_missing";
	readonly message: string;
}): TexturePreviewResult {
	return {
		contract: { name: "texture-preview", version: { major: 1, minor: 0 } },
		status: "unavailable",
		objectPath: options.objectPath,
		reason: options.reason,
		message: options.message,
		retrySafe: false
	};
}

function remoteCall(options: {
	readonly endpoint: string;
	readonly objectPath: string;
	readonly functionName: string;
	readonly operation: "manifest" | "preview";
	readonly parameters: Readonly<Record<string, unknown>>;
}): Effect.Effect<unknown, LiveTexturePreviewError> {
	const endpoint = options.endpoint.replace(/\/+$/, "");
	return Effect.tryPromise({
		try: async (signal) => {
			const response = await fetch(`${endpoint}/remote/object/call`, {
				body: JSON.stringify({
					generateTransaction: false,
					functionName: options.functionName,
					objectPath: options.objectPath,
					parameters: options.parameters
				}),
				headers: { "content-type": "application/json" },
				method: "PUT",
				signal
			});
			if (!response.ok) {
				throw new LiveTexturePreviewError({
					endpoint,
					operation: options.operation,
					message: `Remote Control returned HTTP ${response.status}`,
					retrySafe: response.status >= 500,
					status: response.status
				});
			}
			const envelope = decodeRemoteCallEnvelope(await response.json());
			return JSON.parse(envelope.ResultJson) as unknown;
		},
		catch: (cause) =>
			cause instanceof LiveTexturePreviewError
				? cause
				: new LiveTexturePreviewError({
						endpoint,
						operation: options.operation,
						message: String(cause),
						retrySafe: true
					})
	}).pipe(
		Effect.timeoutFail({
			duration: "10 seconds",
			onTimeout: () =>
				new LiveTexturePreviewError({
					endpoint,
					operation: options.operation,
					message: "Remote Control timed out after 10 seconds",
					retrySafe: true
				})
		}),
		Effect.withSpan(`asset_audits.live_${options.operation}`, {
			attributes: { "unreal.endpoint": endpoint }
		})
	);
}

function readManifest(
	endpoint: string
): Effect.Effect<CompanionCapabilityManifest, LiveTexturePreviewError> {
	return remoteCall({
		endpoint,
		objectPath: coreObjectPath,
		functionName: "GetCapabilityManifest",
		operation: "manifest",
		parameters: {}
	}).pipe(
		Effect.flatMap((value) =>
			Effect.try({
				try: () => decodeCompanionCapabilityManifest(value),
				catch: (cause) =>
					new LiveTexturePreviewError({
						endpoint,
						operation: "manifest",
						message: `Invalid Unreal capability manifest: ${String(cause)}`,
						retrySafe: false
					})
			})
		)
	);
}

export function readLiveTexturePreview(
	options: LiveTexturePreviewOptions
): Effect.Effect<TexturePreviewResult, LiveTexturePreviewError> {
	return readManifest(options.endpoint).pipe(
		Effect.flatMap((manifest) => {
			if (
				!manifest.capabilities.includes(previewCapability) ||
				!manifest.assetAuditsObjectPath
			) {
				return Effect.succeed(
					unavailable({
						objectPath: options.objectPath,
						reason: "capability_missing",
						message: "The running Unreal process does not advertise texture previews."
					})
				);
			}
			return remoteCall({
				endpoint: options.endpoint,
				objectPath: manifest.assetAuditsObjectPath,
				functionName: "GetTexturePreview",
				operation: "preview",
				parameters: {
					TextureObjectPath: options.objectPath,
					MaxDimension: options.maxDimension ?? 384
				}
			}).pipe(
				Effect.flatMap((value) =>
					Effect.try({
						try: () => decodeTexturePreviewResult(value),
						catch: (cause) =>
							new LiveTexturePreviewError({
								endpoint: options.endpoint,
								operation: "preview",
								message: `Invalid texture preview result: ${String(cause)}`,
								retrySafe: false
							})
					})
				)
			);
		})
	);
}
