import {
	decodeTextureAuditRunResult,
	decodeTexturePreviewResult,
	type TextureAuditRunResult,
	type TexturePreviewResult
} from "@ue-shed/asset-audits/browser";
import {
	TextureAuditClient,
	TextureAuditClientError,
	decodeTextureAuditLaunchResult,
	type TextureAuditClientShape,
	type TextureAuditLaunchResult
} from "@ue-shed/extension-asset-audits";
import { Effect } from "effect";

const recovery = "Restart Workbench. If the problem persists, verify package versions.";

function request<A>(args: {
	readonly decode: (value: unknown) => Effect.Effect<A, unknown>;
	readonly invoke: () => Promise<unknown>;
	readonly operation: string;
}): Effect.Effect<A, TextureAuditClientError> {
	return Effect.tryPromise({
		try: args.invoke,
		catch: (cause) =>
			new TextureAuditClientError({ cause, operation: args.operation, recovery })
	}).pipe(
		Effect.flatMap(args.decode),
		Effect.mapError(
			(cause) => new TextureAuditClientError({ cause, operation: args.operation, recovery })
		)
	);
}

export const assetAuditsClient: TextureAuditClientShape = TextureAuditClient.of({
	loadConfiguredProject: Effect.fn("TextureAuditClient.loadConfiguredProject")(
		(): Effect.Effect<TextureAuditRunResult, TextureAuditClientError> =>
			request({
				decode: decodeTextureAuditRunResult,
				invoke: () => window.ueShed.assetAudits.loadConfiguredProject(),
				operation: "assetAudits.loadConfiguredProject"
			})
	),
	chooseProjectAndScan: Effect.fn("TextureAuditClient.chooseProjectAndScan")(
		(): Effect.Effect<TextureAuditRunResult, TextureAuditClientError> =>
			request({
				decode: decodeTextureAuditRunResult,
				invoke: () => window.ueShed.assetAudits.chooseProjectAndScan(),
				operation: "assetAudits.chooseProjectAndScan"
			})
	),
	loadPreview: Effect.fn("TextureAuditClient.loadPreview")(
		(objectPath): Effect.Effect<TexturePreviewResult, TextureAuditClientError> =>
			request({
				decode: decodeTexturePreviewResult,
				invoke: () => window.ueShed.assetAudits.preview(objectPath),
				operation: "assetAudits.preview"
			})
	),
	launchUnreal: Effect.fn("TextureAuditClient.launchUnreal")(
		(): Effect.Effect<TextureAuditLaunchResult, TextureAuditClientError> =>
			request({
				decode: decodeTextureAuditLaunchResult,
				invoke: () => window.ueShed.fixture.launch(),
				operation: "fixture.launch"
			})
	)
});
