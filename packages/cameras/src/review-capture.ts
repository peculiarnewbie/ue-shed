import { createHash, randomUUID } from "node:crypto";
import { join, resolve } from "node:path";
import {
	makeRemoteControlClient,
	RemoteControlClient,
	type RemoteControlClientShape
} from "@ue-shed/unreal-connection";
import { Clock, Context, Effect, Layer, Ref, Schema } from "effect";
import { captureReviewView } from "./review-live.js";
import {
	ReviewRepository,
	captureRunsRoot,
	isPathWithin,
	type ReviewRepositoryShape,
	type ReviewStorageError
} from "./review-repository.js";
import {
	CaptureRunId,
	ArtifactId,
	ReviewCaptureRequest,
	decodeCaptureRun,
	type CaptureRun,
	type ReviewCaptureResponse,
	type ReviewSet,
	type ReviewViewId,
	type ViewResult
} from "./review-schema.js";

export class ReviewCaptureRunError extends Schema.TaggedErrorClass<ReviewCaptureRunError>()(
	"ReviewCaptureRunError",
	{
		message: Schema.String,
		operation: Schema.Literals(["prepare", "capture", "finalize"]),
		recovery: Schema.String,
		runId: Schema.String
	}
) {}

export const ReviewCaptureConcurrency = Schema.Int.check(Schema.isGreaterThanOrEqualTo(1));
export type ReviewCaptureConcurrency = Schema.Schema.Type<typeof ReviewCaptureConcurrency>;

/**
 * Unreal CaptureReviewView mutates shared editor camera state, so the live default is
 * serialized (`concurrency: 1`). Effect.forEach still owns the limit so tests and safe
 * fake ports can raise it explicitly.
 */
export const defaultReviewCaptureConcurrency = ReviewCaptureConcurrency.make(1);

type SchemaReviewCaptureRequest = typeof ReviewCaptureRequest.Type;

export interface ReviewCapturePortShape {
	readonly capture: (
		request: SchemaReviewCaptureRequest
	) => Effect.Effect<ReviewCaptureResponse, unknown>;
}

export class ReviewCapturePort extends Context.Service<ReviewCapturePort, ReviewCapturePortShape>()(
	"@ue-shed/cameras/ReviewCapturePort"
) {}

export interface ReviewIdGeneratorShape {
	readonly generate: () => Effect.Effect<string>;
}

export class ReviewIdGenerator extends Context.Service<ReviewIdGenerator, ReviewIdGeneratorShape>()(
	"@ue-shed/cameras/ReviewIdGenerator"
) {}

export const ReviewIdGeneratorLive = Layer.succeed(
	ReviewIdGenerator,
	ReviewIdGenerator.of({
		generate: Effect.fn("ReviewIdGenerator.generate")(() => Effect.sync(randomUUID))
	})
);

export function reviewIdGeneratorLayer(makeId: () => string): Layer.Layer<ReviewIdGenerator> {
	return Layer.succeed(
		ReviewIdGenerator,
		ReviewIdGenerator.of({
			generate: Effect.fn("ReviewIdGenerator.Test.generate")(() => Effect.sync(makeId))
		})
	);
}

export interface CaptureReviewSetOptions {
	readonly concurrency?: ReviewCaptureConcurrency;
	readonly endpoint: string;
	readonly projectRoot: string;
	readonly reviewSetPath: string;
	readonly viewIds?: ReadonlyArray<ReviewViewId>;
}

function sha256(bytes: Uint8Array): string {
	return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

function isoNow(millis: number): string {
	return new Date(millis).toISOString();
}

function remoteCapturePort(
	client: RemoteControlClientShape,
	endpoint: string
): ReviewCapturePortShape {
	return {
		capture: (request) =>
			captureReviewView({ endpoint, request }).pipe(
				Effect.provideService(RemoteControlClient, client)
			)
	};
}

export function reviewCaptureRemotePortLayer(
	endpoint: string
): Layer.Layer<ReviewCapturePort, never, RemoteControlClient> {
	return Layer.effect(
		ReviewCapturePort,
		Effect.gen(function* () {
			const client = yield* RemoteControlClient;
			return ReviewCapturePort.of(remoteCapturePort(client, endpoint));
		})
	);
}

export function reviewCapturePortLayer(
	service: ReviewCapturePortShape
): Layer.Layer<ReviewCapturePort> {
	return Layer.succeed(ReviewCapturePort, ReviewCapturePort.of(service));
}

function captureOneView(args: {
	readonly capturePort: ReviewCapturePortShape;
	readonly ids: ReviewIdGeneratorShape;
	readonly repository: ReviewRepositoryShape;
	readonly reviewSet: ReviewSet;
	readonly runId: typeof CaptureRunId.Type;
	readonly stagingRoot: string;
	readonly unrealStagingRoot: string;
	readonly view: ReviewSet["views"][number];
}): Effect.Effect<ViewResult, ReviewStorageError> {
	return Effect.gen(function* () {
		const profile = args.reviewSet.captureProfiles.find(
			(candidate) => candidate.id === args.view.captureProfileId
		);
		if (!profile) {
			return {
				code: "capture_profile_missing",
				message: `Review View ${args.view.id} references missing profile ${args.view.captureProfileId}`,
				recovery: "Add the profile to the Review Set or update the Review View.",
				retrySafe: false,
				status: "failed" as const,
				viewId: args.view.id
			};
		}
		const operationId = yield* args.ids.generate();
		const request = ReviewCaptureRequest.make({
			approvedPose: args.view.approvedPose,
			contract: {
				name: "ue-shed-review-capture",
				version: { major: 1, minor: 0 }
			},
			expectedMapPath: args.reviewSet.project.mapPath,
			operationId,
			resolution: profile.resolution,
			subject: args.view.subject,
			viewId: args.view.id
		});
		const response = yield* args.capturePort.capture(request).pipe(
			Effect.catch((cause) =>
				Effect.succeed({
					code: "capture_connection_failed",
					message: String(cause),
					operationId,
					recovery:
						"Verify the editor capability and Remote Control endpoint, then retry.",
					retrySafe: true,
					contract: {
						name: "ue-shed-review-capture" as const,
						version: { major: 1 as const, minor: 0 }
					},
					status: "failed" as const,
					viewId: args.view.id
				})
			)
		);
		if (response.status === "failed") {
			return {
				code: response.code,
				message: response.message,
				recovery: response.recovery,
				retrySafe: response.retrySafe,
				status: "failed" as const,
				viewId: args.view.id
			};
		}
		if (response.mapPackageDirtyAfter !== response.mapPackageDirtyBefore) {
			return {
				code: "map_package_dirty_state_changed",
				message: "Transient review capture changed the map package dirty state.",
				recovery: "Inspect the editor map before retrying; do not save tooling changes.",
				retrySafe: false,
				status: "failed" as const,
				viewId: args.view.id
			};
		}
		if (!isPathWithin(args.unrealStagingRoot, response.stagingPath)) {
			return {
				code: "capture_staging_path_rejected",
				message: "Unreal returned a capture path outside the project review staging root.",
				recovery: "Verify the connected project and editor capability version.",
				retrySafe: false,
				status: "failed" as const,
				viewId: args.view.id
			};
		}

		const relativePath = `views/${args.view.id}/pure.png`;
		const artifactPath = join(args.stagingRoot, ...relativePath.split("/"));
		const stored = yield* args.repository.storeArtifact({
			destinationPath: artifactPath,
			sourcePath: response.stagingPath
		});
		const result = {
			artifact: {
				byteLength: stored.size,
				contentHash: sha256(stored.bytes),
				height: response.height,
				id: ArtifactId.make(`${args.runId}:${args.view.id}:pure`),
				mediaType: "image/png" as const,
				relativePath,
				variant: "pure" as const,
				width: response.width
			},
			captureDurationMs: response.captureDurationMs,
			resolvedActorPath: response.actorPath,
			status: "captured" as const,
			viewId: args.view.id
		};
		yield* args.repository.writeRunDocument({
			path: join(args.stagingRoot, "views", args.view.id, "result.json"),
			value: result
		});
		return result;
	});
}

function captureReviewSetWith(args: {
	readonly capturePort: ReviewCapturePortShape;
	readonly ids: ReviewIdGeneratorShape;
	readonly options: CaptureReviewSetOptions;
	readonly repository: ReviewRepositoryShape;
}): Effect.Effect<CaptureRun, ReviewCaptureRunError | ReviewStorageError> {
	const concurrency = args.options.concurrency ?? defaultReviewCaptureConcurrency;
	return Effect.gen(function* () {
		const reviewSet = yield* args.repository.loadSet(args.options.reviewSetPath);
		const runId = CaptureRunId.make(yield* args.ids.generate());
		const views = args.options.viewIds
			? reviewSet.views.filter((view) => args.options.viewIds?.includes(view.id))
			: reviewSet.views;
		if (views.length === 0 || views.length !== (args.options.viewIds?.length ?? views.length)) {
			return yield* Effect.fail(
				new ReviewCaptureRunError({
					message:
						"The requested capture plan contains missing or duplicate Review View IDs.",
					operation: "prepare",
					recovery: "Reload the Review Set, review the capture plan, and retry.",
					runId
				})
			);
		}
		const startedAt = isoNow(yield* Clock.currentTimeMillis);
		const root = captureRunsRoot(args.options.projectRoot);
		const stagingRoot = join(root, `.staging-${runId}`);
		const finalRoot = join(root, runId);
		const unrealStagingRoot = resolve(
			args.options.projectRoot,
			"Saved",
			"UEShed",
			"ReviewStaging"
		);
		const promoted = yield* Ref.make(false);

		yield* args.repository.prepareRun({ root, stagingRoot });

		return yield* Effect.gen(function* () {
			const results = yield* Effect.forEach(
				views,
				(view) =>
					captureOneView({
						capturePort: args.capturePort,
						ids: args.ids,
						repository: args.repository,
						reviewSet,
						runId,
						stagingRoot,
						unrealStagingRoot,
						view
					}),
				{ concurrency }
			);

			const failures = results.filter((result) => result.status === "failed").length;
			const successes = results.length - failures;
			const run = yield* decodeCaptureRun({
				completedAt: isoNow(yield* Clock.currentTimeMillis),
				contract: { name: "ue-shed-capture-run", version: { major: 1, minor: 0 } },
				id: runId,
				project: reviewSet.project,
				results,
				reviewSetId: reviewSet.id,
				startedAt,
				status:
					failures === 0
						? "completed"
						: successes === 0
							? "failed"
							: "completed_with_failures"
			}).pipe(
				Effect.mapError(
					(cause) =>
						new ReviewCaptureRunError({
							message: String(cause),
							operation: "finalize",
							recovery: "Inspect the generated Capture Run values and retry.",
							runId
						})
				)
			);

			return yield* args.repository
				.finalizeRun({ finalRoot, run, stagingRoot })
				.pipe(
					Effect.andThen(Ref.set(promoted, true)),
					Effect.as(run),
					Effect.uninterruptible
				);
		}).pipe(
			Effect.onExit((exit) =>
				Effect.gen(function* () {
					if (yield* Ref.get(promoted)) return;
					yield* args.repository
						.discardStaging(stagingRoot)
						.pipe(Effect.uninterruptible, Effect.ignore);
					void exit;
				})
			)
		);
	}).pipe(
		Effect.withSpan("camera.review.run.capture", {
			attributes: {
				"camera.review.capture.concurrency": concurrency,
				"camera.review.set.path": args.options.reviewSetPath
			}
		})
	);
}

export interface ReviewCaptureShape {
	readonly captureSet: (
		options: CaptureReviewSetOptions
	) => Effect.Effect<CaptureRun, ReviewCaptureRunError | ReviewStorageError>;
}

export class ReviewCapture extends Context.Service<ReviewCapture, ReviewCaptureShape>()(
	"@ue-shed/cameras/ReviewCapture"
) {}

export const ReviewCaptureLive = Layer.effect(
	ReviewCapture,
	Effect.gen(function* () {
		const repository = yield* ReviewRepository;
		const ids = yield* ReviewIdGenerator;
		const capturePort = yield* ReviewCapturePort;

		const captureSet = Effect.fn("ReviewCapture.captureSet")(function* (
			options: CaptureReviewSetOptions
		) {
			return yield* captureReviewSetWith({
				capturePort,
				ids,
				options,
				repository
			});
		});
		return ReviewCapture.of({ captureSet });
	})
);

export function makeReviewCaptureTestLayer(
	service: ReviewCaptureShape
): Layer.Layer<ReviewCapture> {
	return Layer.succeed(ReviewCapture, ReviewCapture.of(service));
}

/** Compatibility accessor until Plans 012–014 compose ReviewCapture layers directly. */
export function captureReviewSet(
	options: CaptureReviewSetOptions
): Effect.Effect<CaptureRun, ReviewCaptureRunError | ReviewStorageError, ReviewRepository> {
	const remoteClient = Layer.sync(RemoteControlClient, () =>
		makeRemoteControlClient({ defaultTimeout: "10 seconds" })
	);
	return Effect.flatMap(ReviewCapture, (service) => service.captureSet(options)).pipe(
		Effect.provide(ReviewCaptureLive),
		Effect.provide(reviewCaptureRemotePortLayer(options.endpoint)),
		Effect.provide(ReviewIdGeneratorLive),
		Effect.provide(remoteClient)
	);
}
