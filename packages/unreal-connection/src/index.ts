import {
	decodeAuthoringApplyResult,
	decodeAuthoringSaveResult,
	decodeAuthoringTableList,
	decodeAuthoringTableSnapshot,
	decodeCompanionCapabilityManifest,
	type AuthoringApplyRequest,
	type AuthoringApplyResult,
	type AuthoringSaveRequest,
	type AuthoringSaveResult,
	type AuthoringTableSnapshot,
	type CompanionCapabilityManifest
} from "@ue-shed/protocol";
import { Data, Effect, Schema } from "effect";

const coreObjectPath = "/Script/UEShedCore.Default__UEShedCoreLibrary";
const requiredCapabilities = [
	"authoring.snapshot.v2",
	"authoring.table-list.v1",
	"authoring.apply.v1",
	"authoring.apply-result.v1",
	"authoring.save.v1"
] as const;
const RemoteCallResponse = Schema.Struct({ ResultJson: Schema.String });
const decodeRemoteCallResponse = Schema.decodeUnknownSync(RemoteCallResponse);

export class UnrealConnectionError extends Data.TaggedError("UnrealConnectionError")<{
	readonly endpoint: string;
	readonly operation: string;
	readonly message: string;
	readonly retrySafe: boolean;
	readonly status?: number;
}> {}

export class UnrealCapabilityError extends Data.TaggedError("UnrealCapabilityError")<{
	readonly capability: string;
	readonly message: string;
}> {}

export interface UnrealAuthoringConnection {
	readonly endpoint: string;
	readonly manifest: CompanionCapabilityManifest;
	readonly listTableObjectPaths: () => Effect.Effect<readonly string[], UnrealConnectionError>;
	readonly getTableSnapshot: (
		objectPath: string
	) => Effect.Effect<AuthoringTableSnapshot, UnrealConnectionError>;
	readonly apply: (
		request: AuthoringApplyRequest
	) => Effect.Effect<AuthoringApplyResult, UnrealConnectionError>;
	readonly lookupApplyResult: (
		operationId: string
	) => Effect.Effect<AuthoringApplyResult, UnrealConnectionError>;
	readonly save: (
		request: AuthoringSaveRequest
	) => Effect.Effect<AuthoringSaveResult, UnrealConnectionError>;
}

function normalizedEndpoint(endpoint: string): string {
	return endpoint.replace(/\/+$/, "");
}

function remoteCall(
	endpoint: string,
	objectPath: string,
	functionName: string,
	parameters: Readonly<Record<string, unknown>>
): Effect.Effect<unknown, UnrealConnectionError> {
	const operation = `remote_control.${functionName}`;
	const request = Effect.tryPromise({
		try: async (signal) => {
			const response = await fetch(`${endpoint}/remote/object/call`, {
				body: JSON.stringify({
					generateTransaction: false,
					functionName,
					objectPath,
					parameters
				}),
				headers: { "content-type": "application/json" },
				method: "PUT",
				signal
			});
			if (!response.ok) {
				const detail = (await response.text()).slice(0, 4_096).trim();
				throw new UnrealConnectionError({
					endpoint,
					message: `Remote Control returned HTTP ${response.status}${detail ? `: ${detail}` : ""}`,
					operation,
					retrySafe: response.status >= 500,
					status: response.status
				});
			}
			const envelope = decodeRemoteCallResponse(await response.json());
			return JSON.parse(envelope.ResultJson) as unknown;
		},
		catch: (cause) =>
			cause instanceof UnrealConnectionError
				? cause
				: new UnrealConnectionError({
						endpoint,
						message: String(cause),
						operation,
						retrySafe: true
					})
	}).pipe(
		Effect.timeoutFail({
			duration: "10 seconds",
			onTimeout: () =>
				new UnrealConnectionError({
					endpoint,
					message: "Remote Control call timed out after 10 seconds",
					operation,
					retrySafe: true
				})
		}),
		Effect.withSpan(operation, {
			attributes: { "unreal.endpoint": endpoint, "unreal.function": functionName }
		})
	);
	return request;
}

function decodeResult<A>(
	effect: Effect.Effect<unknown, UnrealConnectionError>,
	endpoint: string,
	operation: string,
	decode: (input: unknown) => A
): Effect.Effect<A, UnrealConnectionError> {
	return effect.pipe(
		Effect.flatMap((input) =>
			Effect.try({
				try: () => decode(input),
				catch: (cause) =>
					new UnrealConnectionError({
						endpoint,
						message: `Invalid ${operation} response: ${String(cause)}`,
						operation,
						retrySafe: false
					})
			})
		)
	);
}

export function connectUnrealAuthoring(
	configuredEndpoint: string
): Effect.Effect<UnrealAuthoringConnection, UnrealConnectionError | UnrealCapabilityError> {
	const endpoint = normalizedEndpoint(configuredEndpoint);
	return decodeResult(
		remoteCall(endpoint, coreObjectPath, "GetCapabilityManifest", {}),
		endpoint,
		"capability manifest",
		decodeCompanionCapabilityManifest
	).pipe(
		Effect.flatMap((manifest) => {
			const missing = requiredCapabilities.find(
				(capability) => !manifest.capabilities.includes(capability)
			);
			if (missing) {
				return Effect.fail(
					new UnrealCapabilityError({
						capability: missing,
						message: `Connected editor does not advertise ${missing}`
					})
				);
			}
			if (!manifest.authoringObjectPath) {
				return Effect.fail(
					new UnrealCapabilityError({
						capability: "authoring.endpoint.v1",
						message:
							"Connected editor advertises authoring capabilities without an object path"
					})
				);
			}
			if (
				!manifest.authoringLimits ||
				manifest.authoringLimits.maxCommands < 1 ||
				manifest.authoringLimits.maxPayloadBytes < 1 ||
				manifest.authoringLimits.maxTables < 1
			) {
				return Effect.fail(
					new UnrealCapabilityError({
						capability: "authoring.limits.v1",
						message:
							"Connected editor does not advertise valid authoring mutation limits"
					})
				);
			}
			const authoringObjectPath = manifest.authoringObjectPath;
			const call = (functionName: string, parameters: Readonly<Record<string, unknown>>) =>
				remoteCall(endpoint, authoringObjectPath, functionName, parameters);
			return Effect.succeed<UnrealAuthoringConnection>({
				endpoint,
				manifest,
				listTableObjectPaths: () =>
					decodeResult(
						call("ListTableObjectPaths", {}),
						endpoint,
						"table list",
						decodeAuthoringTableList
					).pipe(Effect.map((result) => result.objectPaths)),
				getTableSnapshot: (objectPath) =>
					decodeResult(
						call("GetTableSnapshot", { TableObjectPath: objectPath }),
						endpoint,
						"table snapshot",
						decodeAuthoringTableSnapshot
					),
				apply: (request) =>
					decodeResult(
						call("Apply", { RequestJson: JSON.stringify(request) }),
						endpoint,
						"Apply",
						decodeAuthoringApplyResult
					),
				lookupApplyResult: (operationId) =>
					decodeResult(
						call("LookupApplyResult", { OperationId: operationId }),
						endpoint,
						"Apply lookup",
						decodeAuthoringApplyResult
					),
				save: (request) =>
					decodeResult(
						call("Save", { RequestJson: JSON.stringify(request) }),
						endpoint,
						"Save",
						decodeAuthoringSaveResult
					)
			});
		}),
		Effect.withSpan("unreal.authoring.connect", {
			attributes: { "unreal.endpoint": endpoint }
		})
	);
}
