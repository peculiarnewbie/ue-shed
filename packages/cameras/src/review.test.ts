import { createHash } from "node:crypto";
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { Deferred, Effect, Fiber, Layer } from "effect";
import { afterEach, describe, expect, it } from "vitest";
import {
	ReviewCapture,
	ReviewCaptureLive,
	reviewCapturePortLayer,
	reviewIdGeneratorLayer,
	type ReviewCapturePortShape
} from "./review-capture.js";
import {
	captureRunPath,
	captureRunsRoot,
	isPathWithin,
	listCaptureRuns,
	loadCaptureRun,
	loadReviewSet,
	ReviewRepository,
	ReviewRepositoryLive,
	saveReviewSet
} from "./review-repository.js";
import {
	CaptureProfileId,
	ReviewSetId,
	ReviewViewId,
	decodeReviewSet as decodeReviewSetEffect,
	type ReviewSet
} from "./review-schema.js";

const decodeReviewSet = (input: unknown) => Effect.runSync(decodeReviewSetEffect(input));

const temporaryDirectories: string[] = [];

afterEach(async () => {
	await Promise.all(
		temporaryDirectories.splice(0).map((path) => rm(path, { force: true, recursive: true }))
	);
});

function fixtureReviewSet(): ReviewSet {
	return decodeReviewSet({
		captureProfiles: [
			{
				id: "fixture-hd",
				imageFormat: "png",
				renderProfile: "full_fidelity",
				resolution: { height: 720, width: 1280 },
				variantPolicy: "pure_only"
			}
		],
		contract: { name: "ue-shed-review-set", version: { major: 1, minor: 0 } },
		displayName: "Fixture structure",
		id: "fixture-structure",
		project: {
			id: "ue-shed-fixture",
			mapPath: "/Game/Fixture/Cameras/L_CameraLoad"
		},
		views: [
			{
				approvedPose: {
					aspectRatio: "16:9",
					fieldOfViewDegrees: 60,
					location: { x: 1000, y: 1000, z: 600 },
					projection: "perspective",
					rotation: { pitch: -15, roll: 0, yaw: -135 }
				},
				captureProfileId: "fixture-hd",
				displayName: "Structure context",
				framingRecipe: { kind: "manual", version: 1 },
				id: "structure-context",
				purpose: "Track the fixture structure over time",
				subject: {
					actorPath:
						"/Game/Fixture/Cameras/L_CameraLoad.L_CameraLoad:PersistentLevel.ReviewSubject",
					kind: "actor_path"
				},
				tags: ["fixture", "context"]
			}
		]
	});
}

function runCapture(
	options: {
		readonly projectRoot: string;
		readonly reviewSetPath: string;
		readonly viewIds?: ReadonlyArray<ReviewViewId>;
	},
	port: ReviewCapturePortShape,
	makeId: () => string
) {
	return Effect.runPromise(
		Effect.flatMap(ReviewCapture, (service) =>
			service.captureSet({
				endpoint: "http://127.0.0.1:30001",
				projectRoot: options.projectRoot,
				reviewSetPath: options.reviewSetPath,
				...(options.viewIds ? { viewIds: options.viewIds } : {})
			})
		).pipe(
			Effect.provide(ReviewCaptureLive),
			Effect.provide(reviewCapturePortLayer(port)),
			Effect.provide(reviewIdGeneratorLayer(makeId)),
			Effect.provide(ReviewRepositoryLive)
		)
	);
}

describe("Map Review contracts", () => {
	it("keeps domain identities branded and validates a complete Review Set", () => {
		const reviewSet = fixtureReviewSet();
		expect(ReviewSetId.make(reviewSet.id)).toBe("fixture-structure");
		expect(ReviewViewId.make(reviewSet.views[0]!.id)).toBe("structure-context");
		expect(CaptureProfileId.make(reviewSet.captureProfiles[0]!.id)).toBe("fixture-hd");
		expect(() =>
			decodeReviewSet({
				...reviewSet,
				views: [
					{
						...reviewSet.views[0],
						approvedPose: {
							...reviewSet.views[0]!.approvedPose,
							fieldOfViewDegrees: 200
						}
					}
				]
			})
		).toThrow();
	});

	it("persists and loads a Review Set through an atomic document boundary", async () => {
		const root = await mkdtemp(join(tmpdir(), "ue-shed-review-set-"));
		temporaryDirectories.push(root);
		const path = join(root, "sets", "fixture.json");
		const reviewSet = fixtureReviewSet();
		await Effect.runPromise(
			saveReviewSet({ path, reviewSet }).pipe(Effect.provide(ReviewRepositoryLive))
		);
		await expect(
			Effect.runPromise(loadReviewSet(path).pipe(Effect.provide(ReviewRepositoryLive)))
		).resolves.toEqual(reviewSet);
	});
});

describe("durable capture loop", () => {
	it("captures only the approved views selected by the plan", async () => {
		const projectRoot = await mkdtemp(join(tmpdir(), "ue-shed-review-subset-"));
		temporaryDirectories.push(projectRoot);
		const reviewSetPath = join(projectRoot, "set.json");
		const reviewSet = fixtureReviewSet();
		const second = {
			...reviewSet.views[0]!,
			displayName: "Structure detail",
			id: ReviewViewId.make("structure-detail")
		};
		await Effect.runPromise(
			saveReviewSet({
				path: reviewSetPath,
				reviewSet: { ...reviewSet, views: [...reviewSet.views, second] }
			}).pipe(Effect.provide(ReviewRepositoryLive))
		);
		const requested: string[] = [];
		const port: ReviewCapturePortShape = {
			capture: (request) => {
				requested.push(request.viewId);
				return Effect.succeed({
					code: "fixture_failure",
					contract: request.contract,
					message: "Expected fixture failure",
					operationId: request.operationId,
					recovery: "No recovery required",
					retrySafe: false,
					status: "failed",
					viewId: request.viewId
				});
			}
		};
		const ids = ["run-subset", "operation-subset"];
		const run = await runCapture(
			{
				projectRoot,
				reviewSetPath,
				viewIds: [ReviewViewId.make("structure-detail")]
			},
			port,
			() => ids.shift()!
		);
		expect(requested).toEqual(["structure-detail"]);
		expect(run.results).toHaveLength(1);
	});

	it("promotes a validated Unreal staging image into an immutable run and history", async () => {
		const projectRoot = await mkdtemp(join(tmpdir(), "ue-shed-review-run-"));
		temporaryDirectories.push(projectRoot);
		const reviewSetPath = join(projectRoot, ".ue-shed", "review", "sets", "fixture.json");
		await Effect.runPromise(
			saveReviewSet({ path: reviewSetPath, reviewSet: fixtureReviewSet() }).pipe(
				Effect.provide(ReviewRepositoryLive)
			)
		);
		const png = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 1, 2, 3, 4]);
		const port: ReviewCapturePortShape = {
			capture: (request) =>
				Effect.tryPromise({
					try: async () => {
						const stagingPath = join(
							projectRoot,
							"Saved",
							"UEShed",
							"ReviewStaging",
							request.operationId,
							request.viewId,
							"pure.png"
						);
						await mkdir(dirname(stagingPath), { recursive: true });
						await writeFile(stagingPath, png);
						return {
							actorPath: request.subject.actorPath,
							captureDurationMs: 12.5,
							contract: request.contract,
							height: request.resolution.height,
							mapPackageDirtyAfter: false,
							mapPackageDirtyBefore: false,
							mapPath: request.expectedMapPath,
							operationId: request.operationId,
							stagingPath,
							status: "captured" as const,
							viewId: request.viewId,
							width: request.resolution.width
						};
					},
					catch: (cause) => cause
				})
		};
		const ids = ["run-001", "operation-001"];

		const run = await runCapture({ projectRoot, reviewSetPath }, port, () => ids.shift()!);

		expect(run.status).toBe("completed");
		expect(run.id).toBe("run-001");
		const persisted = await Effect.runPromise(
			loadCaptureRun(captureRunPath(projectRoot, run.id)).pipe(
				Effect.provide(ReviewRepositoryLive)
			)
		);
		expect(persisted).toEqual(run);
		const artifactPath = join(
			projectRoot,
			".ue-shed",
			"review",
			"runs",
			run.id,
			"views",
			"structure-context",
			"pure.png"
		);
		expect(new Uint8Array(await readFile(artifactPath))).toEqual(png);
		expect(run.results[0]).toMatchObject({
			artifact: {
				contentHash: `sha256:${createHash("sha256").update(png).digest("hex")}`,
				relativePath: "views/structure-context/pure.png"
			},
			status: "captured"
		});
		await expect(
			Effect.runPromise(
				listCaptureRuns(projectRoot).pipe(Effect.provide(ReviewRepositoryLive))
			)
		).resolves.toMatchObject([
			{ failedViews: 0, id: "run-001", status: "completed", successfulViews: 1 }
		]);
	});

	it("rejects staging paths outside the project and finalizes an honest failed run", async () => {
		const projectRoot = await mkdtemp(join(tmpdir(), "ue-shed-review-reject-"));
		temporaryDirectories.push(projectRoot);
		const reviewSetPath = join(projectRoot, "set.json");
		await Effect.runPromise(
			saveReviewSet({ path: reviewSetPath, reviewSet: fixtureReviewSet() }).pipe(
				Effect.provide(ReviewRepositoryLive)
			)
		);
		const outside = join(dirname(projectRoot), "outside.png");
		const port: ReviewCapturePortShape = {
			capture: (request) =>
				Effect.succeed({
					actorPath: request.subject.actorPath,
					captureDurationMs: 1,
					contract: request.contract,
					height: 720,
					mapPackageDirtyAfter: false,
					mapPackageDirtyBefore: false,
					mapPath: request.expectedMapPath,
					operationId: request.operationId,
					stagingPath: outside,
					status: "captured",
					viewId: request.viewId,
					width: 1280
				})
		};
		const ids = ["run-rejected", "operation-rejected"];
		const run = await runCapture({ projectRoot, reviewSetPath }, port, () => ids.shift()!);
		expect(run.status).toBe("failed");
		expect(run.results[0]).toMatchObject({
			code: "capture_staging_path_rejected",
			status: "failed"
		});
	});

	it("discards staging directories when capture fails before promotion", async () => {
		const projectRoot = await mkdtemp(join(tmpdir(), "ue-shed-review-cleanup-"));
		temporaryDirectories.push(projectRoot);
		const reviewSetPath = join(projectRoot, "set.json");
		await Effect.runPromise(
			saveReviewSet({ path: reviewSetPath, reviewSet: fixtureReviewSet() }).pipe(
				Effect.provide(ReviewRepositoryLive)
			)
		);
		const port: ReviewCapturePortShape = {
			capture: () => Effect.die(new Error("capture boom"))
		};
		const ids = ["run-cleanup", "operation-cleanup"];
		await expect(
			runCapture({ projectRoot, reviewSetPath }, port, () => ids.shift()!)
		).rejects.toThrow(/capture boom/);
		await expect(
			access(join(captureRunsRoot(projectRoot), ".staging-run-cleanup"))
		).rejects.toThrow();
	});

	it("finishes promotion before observing interruption", async () => {
		const projectRoot = await mkdtemp(join(tmpdir(), "ue-shed-review-promotion-"));
		temporaryDirectories.push(projectRoot);
		const reviewSetPath = join(projectRoot, "set.json");
		await Effect.runPromise(
			saveReviewSet({ path: reviewSetPath, reviewSet: fixtureReviewSet() }).pipe(
				Effect.provide(ReviewRepositoryLive)
			)
		);
		const png = new Uint8Array([137, 80, 78, 71]);
		const port: ReviewCapturePortShape = {
			capture: (request) =>
				Effect.tryPromise({
					try: async () => {
						const stagingPath = join(
							projectRoot,
							"Saved",
							"UEShed",
							"ReviewStaging",
							request.operationId,
							"pure.png"
						);
						await mkdir(dirname(stagingPath), { recursive: true });
						await writeFile(stagingPath, png);
						return {
							actorPath: request.subject.actorPath,
							captureDurationMs: 1,
							contract: request.contract,
							height: 1,
							mapPackageDirtyAfter: false,
							mapPackageDirtyBefore: false,
							mapPath: request.expectedMapPath,
							operationId: request.operationId,
							stagingPath,
							status: "captured" as const,
							viewId: request.viewId,
							width: 1
						};
					},
					catch: (cause) => cause
				})
		};
		const repository = await Effect.runPromise(
			Effect.gen(function* () {
				return yield* ReviewRepository;
			}).pipe(Effect.provide(ReviewRepositoryLive))
		);
		const promotionStarted = await Effect.runPromise(Deferred.make<void>());
		const releasePromotion = await Effect.runPromise(Deferred.make<void>());
		const gatedRepository = ReviewRepository.of({
			...repository,
			finalizeRun: (args) =>
				Effect.gen(function* () {
					yield* Deferred.succeed(promotionStarted, undefined);
					yield* Deferred.await(releasePromotion);
					yield* repository.finalizeRun(args);
				})
		});
		const ids = ["run-promotion", "operation-promotion"];
		const makeId = () => {
			const id = ids.shift();
			if (!id) throw new Error("Promotion test exhausted its deterministic IDs");
			return id;
		};
		const capture = Effect.flatMap(ReviewCapture, (service) =>
			service.captureSet({
				endpoint: "unused",
				projectRoot,
				reviewSetPath
			})
		).pipe(
			Effect.provide(ReviewCaptureLive),
			Effect.provide(reviewCapturePortLayer(port)),
			Effect.provide(reviewIdGeneratorLayer(makeId)),
			Effect.provide(Layer.succeed(ReviewRepository, gatedRepository))
		);
		const captureFiber = Effect.runFork(capture);
		await Effect.runPromise(Deferred.await(promotionStarted));
		const interruptFiber = Effect.runFork(Fiber.interrupt(captureFiber));
		await Effect.runPromise(Deferred.succeed(releasePromotion, undefined));
		await Effect.runPromise(Fiber.await(interruptFiber));
		await Effect.runPromise(Fiber.await(captureFiber));

		await expect(access(captureRunPath(projectRoot, "run-promotion"))).resolves.toBeUndefined();
		await expect(
			access(join(captureRunsRoot(projectRoot), ".staging-run-promotion"))
		).rejects.toThrow();
	});
});

describe("review staging path validation", () => {
	it("accepts nested project paths and rejects escapes", () => {
		const root = "C:\\Projects\\Fixture";
		expect(isPathWithin(root, join(root, "Saved", "UEShed", "a.png"))).toBe(true);
		expect(isPathWithin(root, join(root, "..", "elsewhere.png"))).toBe(false);
	});
});
