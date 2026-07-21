import {
	decodeMapReviewApprovalResult,
	decodeMapReviewAuthoringResult,
	decodeMapReviewCandidatePreviewResult,
	decodeMapReviewCaptureResult,
	decodeMapReviewResult,
	type MapReviewApprovalResult,
	type MapReviewAuthoringPatchIntent,
	type MapReviewAuthoringPreviewIntent,
	type MapReviewAuthoringSessionIntent,
	type MapReviewCandidatePreviewResult,
	type MapReviewCaptureIntent,
	type MapReviewCaptureResult,
	type MapReviewResult
} from "@ue-shed/cameras/review-contracts";
import {
	MapReviewClient,
	MapReviewClientError,
	type MapReviewClientShape
} from "@ue-shed/extension-camera-review/client";
import {
	decodeWorldScoutFocusResult,
	decodeWorldScoutResult,
	type ActorId,
	type WorldScoutRefreshRate,
	type WorldScoutResult
} from "@ue-shed/observatory";
import { Effect, Queue, Schedule, Stream } from "effect";

const recovery = "Restart Workbench. If the problem persists, verify package versions.";

const loadWorldSnapshot = (): Effect.Effect<WorldScoutResult, MapReviewClientError> =>
	request({
		decode: decodeWorldScoutResult,
		invoke: () => window.ueShed.mapReview.worldSnapshot(),
		operation: "mapReview.worldSnapshot"
	});

function request<A>(args: {
	readonly decode: (value: unknown) => Effect.Effect<A, unknown>;
	readonly invoke: () => Promise<unknown>;
	readonly operation: string;
}): Effect.Effect<A, MapReviewClientError> {
	return Effect.tryPromise({
		try: args.invoke,
		catch: (cause) => new MapReviewClientError({ cause, operation: args.operation, recovery })
	}).pipe(
		Effect.flatMap(args.decode),
		Effect.mapError(
			(cause) => new MapReviewClientError({ cause, operation: args.operation, recovery })
		)
	);
}

export const mapReviewClient: MapReviewClientShape = MapReviewClient.of({
	connectWorld: Effect.fn("MapReviewClient.connectWorld")(() => loadWorldSnapshot()),
	focusActor: Effect.fn("MapReviewClient.focusActor")((actorId: ActorId, bringToFront: boolean) =>
		request({
			decode: decodeWorldScoutFocusResult,
			invoke: () => window.ueShed.mapReview.focusActor(actorId, bringToFront),
			operation: "mapReview.focusActor"
		})
	),
	worldSnapshots: (refreshRate: WorldScoutRefreshRate) =>
		Stream.fromEffectSchedule(
			Effect.catch(loadWorldSnapshot(), (cause) =>
				Effect.succeed({
					message: cause.message,
					recovery: cause.recovery,
					status: "unavailable" as const
				})
			),
			Schedule.spaced(`${1_000 / refreshRate} millis`)
		),
	liveFrames: Stream.callback(
		(queue) =>
			Effect.acquireRelease(
				Effect.sync(() =>
					window.ueShed.onFrame((frame) =>
						Queue.offerUnsafe(queue, {
							cameraIndex: frame.cameraIndex,
							height: frame.height,
							pixels: frame.pixels,
							width: frame.width
						})
					)
				),
				(unsubscribe) => Effect.sync(unsubscribe)
			),
		{ bufferSize: 32, strategy: "sliding" }
	),
	setLivePreviewFps: Effect.fn("MapReviewClient.setLivePreviewFps")((fps) =>
		request({
			decode: (value) =>
				typeof value === "number"
					? Effect.succeed(value)
					: Effect.fail(new Error("Expected a numeric live preview FPS.")),
			invoke: () => window.ueShed.mapReview.setLivePreviewFps(fps),
			operation: "mapReview.setLivePreviewFps"
		})
	),
	approveCandidate: Effect.fn("MapReviewClient.approveCandidate")(
		(intent): Effect.Effect<MapReviewApprovalResult, MapReviewClientError> =>
			request({
				decode: decodeMapReviewApprovalResult,
				invoke: () => window.ueShed.mapReview.approveCandidate(intent),
				operation: "mapReview.approveCandidate"
			})
	),
	authorFromSelection: Effect.fn("MapReviewClient.authorFromSelection")(() =>
		request({
			decode: decodeMapReviewAuthoringResult,
			invoke: () => window.ueShed.mapReview.authorFromSelection(),
			operation: "mapReview.authorFromSelection"
		})
	),
	authoringResume: Effect.fn("MapReviewClient.authoringResume")(() =>
		request({
			decode: decodeMapReviewAuthoringResult,
			invoke: () => window.ueShed.mapReview.authoringResume(),
			operation: "mapReview.authoringResume"
		})
	),
	authoringPatch: Effect.fn("MapReviewClient.authoringPatch")(
		(intent: MapReviewAuthoringPatchIntent) =>
			request({
				decode: decodeMapReviewAuthoringResult,
				invoke: () => window.ueShed.mapReview.authoringPatch(intent),
				operation: "mapReview.authoringPatch"
			})
	),
	authoringReframe: Effect.fn("MapReviewClient.authoringReframe")(
		(intent: MapReviewAuthoringSessionIntent) =>
			request({
				decode: decodeMapReviewAuthoringResult,
				invoke: () => window.ueShed.mapReview.authoringReframe(intent),
				operation: "mapReview.authoringReframe"
			})
	),
	discardAuthoring: Effect.fn("MapReviewClient.discardAuthoring")(
		(intent: MapReviewAuthoringSessionIntent) =>
			request({
				decode: decodeMapReviewAuthoringResult,
				invoke: () => window.ueShed.mapReview.discardAuthoring(intent),
				operation: "mapReview.discardAuthoring"
			})
	),
	previewAuthoringCandidate: Effect.fn("MapReviewClient.previewAuthoringCandidate")(
		(intent: MapReviewAuthoringPreviewIntent) =>
			request({
				decode: decodeMapReviewCandidatePreviewResult,
				invoke: () => window.ueShed.mapReview.previewAuthoringCandidate(intent),
				operation: "mapReview.previewAuthoringCandidate"
			})
	),
	approveAuthoring: Effect.fn("MapReviewClient.approveAuthoring")(
		(intent: MapReviewAuthoringSessionIntent) =>
			request({
				decode: decodeMapReviewApprovalResult,
				invoke: () => window.ueShed.mapReview.approveAuthoring(intent),
				operation: "mapReview.approveAuthoring"
			})
	),
	capture: Effect.fn("MapReviewClient.capture")(
		(
			intent: MapReviewCaptureIntent
		): Effect.Effect<MapReviewCaptureResult, MapReviewClientError> =>
			request({
				decode: decodeMapReviewCaptureResult,
				invoke: () => window.ueShed.mapReview.capture(intent),
				operation: "mapReview.capture"
			})
	),
	load: Effect.fn("MapReviewClient.load")(
		(): Effect.Effect<MapReviewResult, MapReviewClientError> =>
			request({
				decode: decodeMapReviewResult,
				invoke: () => window.ueShed.mapReview.load(),
				operation: "mapReview.load"
			})
	),
	previewCandidate: Effect.fn("MapReviewClient.previewCandidate")(
		(candidateId): Effect.Effect<MapReviewCandidatePreviewResult, MapReviewClientError> =>
			request({
				decode: decodeMapReviewCandidatePreviewResult,
				invoke: () => window.ueShed.mapReview.previewCandidate(candidateId),
				operation: "mapReview.previewCandidate"
			})
	)
});
