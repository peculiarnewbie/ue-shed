import {
	approveFramingCandidate,
	awaitReviewPreviewFrame,
	CameraFeed,
	ensureReviewPreviewSources,
	generateFramingCandidates,
	ReviewAuthoring,
	ReviewAuthoringSessions,
	ReviewCapture,
	ReviewRepository,
	ReviewViewId,
	evaluateReviewCapturePolicy,
	type ReviewAuthoringSession,
	type CaptureRunSummary,
	type ReviewSet
} from "@ue-shed/cameras";
import { EditorPlaySession } from "@ue-shed/engine-discovery";
import type {
	MapReviewApprovalResult,
	MapReviewApproveCandidateIntent,
	MapReviewAuthoringPatchIntent,
	MapReviewAuthoringPreviewIntent,
	MapReviewAuthoringResult,
	MapReviewAuthoringSessionIntent,
	MapReviewCandidatePreviewResult,
	MapReviewCaptureIntent,
	MapReviewCaptureResult,
	MapReviewResult,
	MapReviewRunView
} from "@ue-shed/cameras/review-contracts";
import {
	Observatory,
	type ActorId,
	type WorldScoutFocusResult,
	type WorldScoutResult
} from "@ue-shed/observatory";
import { RemoteControlClient } from "@ue-shed/unreal-connection";
import { Context, Effect, Layer, Option, Ref, Clock, Semaphore } from "effect";
import { dirname } from "node:path";
import { LocalFiles } from "../adapters/local-files.js";
import { WorkbenchConfiguration } from "../workbench-config.js";
import { makeUnrealOperationCoordinator } from "./unreal-operation-coordinator.js";

const artifactReadConcurrency = 4;

interface ReviewFailure {
	readonly error: { readonly message: string; readonly recovery: string };
	readonly status: "failed";
}

export interface WorkbenchMapReviewShape {
	readonly worldSnapshot: () => Effect.Effect<WorldScoutResult>;
	readonly focusActor: (
		actorId: ActorId,
		bringToFront: boolean
	) => Effect.Effect<WorldScoutFocusResult>;
	readonly approveCandidate: (
		intent: MapReviewApproveCandidateIntent
	) => Effect.Effect<MapReviewApprovalResult>;
	readonly authorFromSelection: () => Effect.Effect<MapReviewAuthoringResult>;
	readonly authoringPatch: (
		intent: MapReviewAuthoringPatchIntent
	) => Effect.Effect<MapReviewAuthoringResult>;
	readonly authoringReframe: (
		intent: MapReviewAuthoringSessionIntent
	) => Effect.Effect<MapReviewAuthoringResult>;
	readonly authoringResume: (
		intent: MapReviewAuthoringSessionIntent | undefined
	) => Effect.Effect<MapReviewAuthoringResult>;
	readonly discardAuthoring: (
		intent: MapReviewAuthoringSessionIntent
	) => Effect.Effect<MapReviewAuthoringResult>;
	readonly approveAuthoring: (
		intent: MapReviewAuthoringSessionIntent
	) => Effect.Effect<MapReviewApprovalResult>;
	readonly capture: (intent: MapReviewCaptureIntent) => Effect.Effect<MapReviewCaptureResult>;
	readonly load: () => Effect.Effect<MapReviewResult>;
	readonly previewCandidate: (
		candidateId: string
	) => Effect.Effect<MapReviewCandidatePreviewResult>;
	readonly previewAuthoringCandidate: (
		intent: MapReviewAuthoringPreviewIntent
	) => Effect.Effect<MapReviewCandidatePreviewResult>;
}

export class WorkbenchMapReview extends Context.Service<
	WorkbenchMapReview,
	WorkbenchMapReviewShape
>()("@ue-shed/workbench/WorkbenchMapReview") {}

function mapReviewFailure(cause: {
	readonly message?: string;
	readonly recovery?: string;
}): ReviewFailure {
	return {
		error: {
			message: cause.message ?? String(cause),
			recovery:
				cause.recovery ??
				"Verify the Review Set, project directory, and local evidence store."
		},
		status: "failed"
	};
}

function mapReviewAuthoringFailure(cause: {
	readonly message?: string;
	readonly recovery?: string;
}): ReviewFailure {
	return {
		error: {
			message: cause.message ?? String(cause),
			recovery:
				cause.recovery ??
				"Verify the editor selection and Map Review authoring capability, then retry."
		},
		status: "failed"
	};
}

function authoringResult(
	session: ReviewAuthoringSession,
	recovery?: string
): MapReviewAuthoringResult {
	return {
		candidates: session.candidates.map((candidate) => {
			const realization = session.realizations.find(
				(item) => item.candidateId === candidate.id
			);
			return {
				diagnostics: [...candidate.diagnostics, ...(realization?.diagnostics ?? [])],
				displayName: candidate.displayName,
				id: candidate.id,
				pose: candidate.approvedPose,
				preset: candidate.recipe.preset,
				preview: { status: "pending" as const }
			};
		}),
		...(recovery === undefined ? {} : { recovery }),
		selection: {
			actorPath: session.subject.actorPath,
			displayName: session.subject.displayName,
			mapPath: session.subject.mapPath
		},
		session,
		sessionId: session.id,
		status: "ready",
		viewId: session.viewId
	};
}

export const WorkbenchMapReviewLive = Layer.effect(
	WorkbenchMapReview,
	Effect.gen(function* () {
		const configuration = yield* WorkbenchConfiguration;
		const localFiles = yield* LocalFiles;
		const repository = yield* ReviewRepository;
		const capture = yield* ReviewCapture;
		const authoring = yield* ReviewAuthoring;
		const authoringSessions = yield* ReviewAuthoringSessions;
		const observatory = yield* Observatory;
		const editorSession = yield* EditorPlaySession;
		const cameraFeed = yield* CameraFeed;
		const remoteControl = yield* RemoteControlClient;
		const coordinator = yield* makeUnrealOperationCoordinator;
		const lastWorldSnapshot = yield* Ref.make<Option.Option<WorldScoutResult>>(Option.none());
		const activeReviewSetPath = yield* Ref.make<Option.Option<string>>(Option.none());
		const livePreviewBindings = yield* Ref.make<
			Option.Option<{
				readonly bindings: ReadonlyArray<{
					readonly candidateId: string;
					readonly index: number;
				}>;
				readonly sessionId: string;
			}>
		>(Option.none());
		const playActiveCache = yield* Ref.make<
			Option.Option<{ readonly active: boolean; readonly checkedAtMs: number }>
		>(Option.none());
		const liveEnsureGate = yield* Semaphore.make(1);

		const reviewProject =
			configuration.review.status === "not_configured"
				? undefined
				: { projectRoot: configuration.review.projectRoot };
		const selectedReviewSetPath = Effect.fn(
			"Workbench.WorkbenchMapReview.selectedReviewSetPath"
		)(function* () {
			if (configuration.review.status === "configured")
				return configuration.review.reviewSetPath;
			return yield* Ref.get(activeReviewSetPath).pipe(Effect.map(Option.getOrUndefined));
		});

		const worldSnapshot = Effect.fn("Workbench.WorkbenchMapReview.worldSnapshot")(function* () {
			const result = yield* coordinator.poll(
				observatory.snapshot(configuration.remoteControlEndpoint).pipe(
					Effect.map((snapshot) => ({ snapshot, status: "ready" as const })),
					Effect.catch((cause) =>
						Effect.succeed({
							message: cause.message,
							recovery: cause.recovery,
							status: "unavailable" as const
						})
					)
				)
			);
			if (Option.isSome(result)) {
				if (result.value.status === "ready") {
					yield* Ref.set(lastWorldSnapshot, Option.some(result.value));
				}
				return result.value;
			}
			return Option.getOrElse(yield* Ref.get(lastWorldSnapshot), () => ({
				message: "Unreal is busy with a selected preview or durable capture.",
				recovery: "Live world scouting will resume automatically.",
				status: "unavailable" as const
			}));
		});

		const focusActor = Effect.fn("Workbench.WorkbenchMapReview.focusActor")(function* (
			actorId: ActorId,
			bringToFront: boolean
		) {
			return yield* coordinator.exclusive(
				observatory.focus(configuration.remoteControlEndpoint, actorId, bringToFront).pipe(
					Effect.catch((cause) =>
						Effect.succeed({
							actorId,
							message: cause.message,
							recovery: cause.recovery,
							status: "failed" as const
						})
					)
				)
			);
		});

		const buildRunView = Effect.fn("Workbench.WorkbenchMapReview.buildRunView")(function* (
			summary: CaptureRunSummary,
			reviewSet: ReviewSet
		) {
			const run = yield* repository.loadRun(summary.path);
			const captured = run.results.find((result) => result.status === "captured");
			if (!captured) return summary satisfies MapReviewRunView;
			const view = reviewSet.views.find((candidate) => candidate.id === captured.viewId);
			const bytes = yield* localFiles.readFileWithin(
				dirname(summary.path),
				captured.artifact.relativePath
			);
			return {
				...summary,
				preview: {
					bytes,
					height: captured.artifact.height,
					viewName: view?.displayName ?? captured.viewId,
					width: captured.artifact.width
				}
			} satisfies MapReviewRunView;
		});

		const load = Effect.fn("Workbench.WorkbenchMapReview.load")(function* () {
			if (reviewProject === undefined) return { status: "not_configured" as const };
			const { projectRoot } = reviewProject;
			const reviewSetPath = yield* selectedReviewSetPath();
			if (reviewSetPath === undefined) return { status: "setup_required" as const };
			return yield* Effect.gen(function* () {
				const reviewSet = yield* repository.loadSet(reviewSetPath);
				const views = yield* Effect.forEach(reviewSet.views, (view) => {
					const profile = reviewSet.captureProfiles.find(
						(candidate) => candidate.id === view.captureProfileId
					);
					return profile
						? Effect.succeed({
								displayName: view.displayName,
								id: view.id,
								resolution: profile.resolution
							})
						: Effect.fail(
								new Error(
									`Review View ${view.id} references missing profile ${view.captureProfileId}.`
								)
							);
				});
				const summaries = yield* repository.listRuns(projectRoot);
				const runs = yield* Effect.forEach(
					summaries,
					(summary) => buildRunView(summary, reviewSet),
					{ concurrency: artifactReadConcurrency }
				);
				return {
					reviewSet: {
						displayName: reviewSet.displayName,
						mapPath: reviewSet.project.mapPath,
						viewCount: reviewSet.views.length,
						views
					},
					runs,
					status: "ready" as const
				};
			}).pipe(Effect.catch((cause) => Effect.succeed(mapReviewFailure(cause))));
		});

		const captureAndReload = Effect.fn("Workbench.WorkbenchMapReview.capture")(function* (
			intent: MapReviewCaptureIntent
		) {
			if (reviewProject === undefined) return { status: "not_configured" as const };
			const reviewSetPath = yield* selectedReviewSetPath();
			if (reviewSetPath === undefined) return { status: "not_configured" as const };
			const session = yield* editorSession
				.status(configuration.remoteControlEndpoint)
				.pipe(Effect.option);
			if (Option.isNone(session)) {
				return {
					policy: {
						code: "play_session_unavailable" as const,
						message: "Workbench could not verify the Unreal Editor play-session state.",
						recovery:
							"Confirm UEShedCoreEditor and Remote Control are available, then retry."
					},
					status: "blocked" as const
				};
			}
			const policy = evaluateReviewCapturePolicy(session.value.state);
			if (policy.status === "blocked") {
				const { status: _status, ...block } = policy;
				return { policy: block, status: "blocked" as const };
			}
			const { projectRoot } = reviewProject;
			return yield* coordinator.exclusive(
				capture
					.captureSet({
						endpoint: configuration.remoteControlEndpoint,
						projectRoot,
						reviewSetPath,
						viewIds: intent.viewIds.map((viewId) => ReviewViewId.make(viewId))
					})
					.pipe(
						Effect.flatMap((run) =>
							load().pipe(
								Effect.map((review): MapReviewCaptureResult => {
									if (review.status === "setup_required") {
										return { status: "not_configured" as const };
									}
									if (review.status !== "ready") return review;
									const failedViews = run.results.filter(
										(result) => result.status === "failed"
									).length;
									return {
										job: {
											completedAt: run.completedAt,
											context: "editor",
											failedViews,
											jobId: run.id,
											progress: {
												completedViews: run.results.length,
												totalViews: intent.viewIds.length
											},
											runId: run.id,
											status: "completed",
											successfulViews: run.results.length - failedViews,
											viewIds: intent.viewIds
										},
										review,
										status: "completed"
									};
								})
							)
						),
						Effect.catch((cause) => Effect.succeed(mapReviewFailure(cause)))
					)
			);
		});

		const authorFromSelection = Effect.fn("Workbench.WorkbenchMapReview.authorFromSelection")(
			function* () {
				if (reviewProject === undefined) {
					return mapReviewAuthoringFailure({
						message: "No review project is configured."
					});
				}
				const { projectRoot } = reviewProject;
				return yield* coordinator.exclusive(
					Effect.gen(function* () {
						const selection = yield* authoring.inspectSelection(
							configuration.remoteControlEndpoint
						);
						if (selection.status === "failed") {
							return {
								error: { message: selection.message, recovery: selection.recovery },
								status: "failed" as const
							};
						}
						const candidates = generateFramingCandidates(selection);
						const session = yield* authoringSessions.start({
							candidates,
							projectRoot,
							...(configuration.review.status === "configured"
								? { reviewSetPath: configuration.review.reviewSetPath }
								: {}),
							selection
						});
						return authoringResult(session);
					}).pipe(
						Effect.catch((cause) => Effect.succeed(mapReviewAuthoringFailure(cause)))
					)
				);
			}
		);

		const authoringResume = Effect.fn("Workbench.WorkbenchMapReview.authoringResume")(
			function* (intent: MapReviewAuthoringSessionIntent | undefined) {
				if (reviewProject === undefined) {
					return mapReviewAuthoringFailure({
						message: "No review project is configured."
					});
				}
				const projectRoot = reviewProject.projectRoot;
				return yield* Effect.gen(function* () {
					const session = intent
						? yield* authoringSessions.load({
								projectRoot,
								sessionId: intent.sessionId
							})
						: yield* authoringSessions.latest({
								projectRoot
							});
					if (!session) {
						return mapReviewAuthoringFailure({
							message: "There is no active Map Review authoring session to resume.",
							recovery: "Select an actor and use Reframe selected actor to start one."
						});
					}
					return yield* coordinator.exclusive(
						authoringSessions
							.resume({
								endpoint: configuration.remoteControlEndpoint,
								projectRoot,
								sessionId: session.id
							})
							.pipe(
								Effect.map((recovered): MapReviewAuthoringResult => {
									if (recovered.status === "resumable")
										return authoringResult(recovered.session);
									if (recovered.status === "stale") {
										return authoringResult(
											recovered.session,
											recovered.recovery
										);
									}
									return mapReviewAuthoringFailure({
										message:
											recovered.status === "corrupt"
												? recovered.message
												: "The persisted Review Set is unavailable.",
										recovery: recovered.recovery
									});
								})
							)
					);
				}).pipe(Effect.catch((cause) => Effect.succeed(mapReviewAuthoringFailure(cause))));
			}
		);

		const authoringPatch = Effect.fn("Workbench.WorkbenchMapReview.authoringPatch")(function* (
			intent: MapReviewAuthoringPatchIntent
		) {
			if (reviewProject === undefined) {
				return mapReviewAuthoringFailure({ message: "No review project is configured." });
			}
			const projectRoot = reviewProject.projectRoot;
			return yield* authoringSessions
				.patch({
					patch: intent.patch,
					projectRoot,
					sessionId: intent.sessionId
				})
				.pipe(
					Effect.map(authoringResult),
					Effect.catch((cause) => Effect.succeed(mapReviewAuthoringFailure(cause)))
				);
		});

		const discardAuthoring = Effect.fn("Workbench.WorkbenchMapReview.discardAuthoring")(
			function* (intent: MapReviewAuthoringSessionIntent) {
				if (reviewProject === undefined) {
					return mapReviewAuthoringFailure({
						message: "No review project is configured."
					});
				}
				const projectRoot = reviewProject.projectRoot;
				return yield* authoringSessions
					.discard({ projectRoot, sessionId: intent.sessionId })
					.pipe(
						Effect.map(authoringResult),
						Effect.catch((cause) => Effect.succeed(mapReviewAuthoringFailure(cause)))
					);
			}
		);

		const authoringReframe = Effect.fn("Workbench.WorkbenchMapReview.authoringReframe")(
			function* (intent: MapReviewAuthoringSessionIntent) {
				if (reviewProject === undefined) {
					return mapReviewAuthoringFailure({
						message: "No review project is configured."
					});
				}
				const { projectRoot } = reviewProject;
				return yield* coordinator.exclusive(
					Effect.gen(function* () {
						const selection = yield* authoring.inspectSelection(
							configuration.remoteControlEndpoint
						);
						if (selection.status === "failed") {
							return mapReviewAuthoringFailure({
								message: selection.message,
								recovery: selection.recovery
							});
						}
						const session = yield* authoringSessions.reframe({
							candidates: generateFramingCandidates(selection),
							projectRoot,
							selection,
							sessionId: intent.sessionId
						});
						return authoringResult(session);
					}).pipe(
						Effect.catch((cause) => Effect.succeed(mapReviewAuthoringFailure(cause)))
					)
				);
			}
		);

		const previewAuthoringCandidate = Effect.fn(
			"Workbench.WorkbenchMapReview.previewAuthoringCandidate"
		)(function* (intent: MapReviewAuthoringPreviewIntent) {
			return yield* Effect.gen(function* () {
				if (reviewProject === undefined) {
					return mapReviewAuthoringFailure({
						message: "No review project is configured."
					});
				}
				const projectRoot = reviewProject.projectRoot;

				// Warm live path: skip session I/O when the preview bank is already up.
				const warmBindings = yield* Ref.get(livePreviewBindings);
				const warmPlay = yield* Ref.get(playActiveCache);
				if (
					Option.isSome(warmBindings) &&
					warmBindings.value.sessionId === intent.sessionId &&
					Option.isSome(warmPlay) &&
					warmPlay.value.active
				) {
					const binding = warmBindings.value.bindings.find(
						(item) => item.candidateId === intent.candidateId
					);
					if (binding !== undefined) {
						const frame = yield* awaitReviewPreviewFrame({
							cameraIndex: binding.index,
							latestFrames: cameraFeed.latestFrames,
							timeout: "3 seconds"
						});
						return {
							bytes: frame.pixels,
							diagnostics: [],
							height: frame.height,
							pixelFormat: "bgra8" as const,
							status: "ready" as const,
							width: frame.width
						};
					}
				}

				const session = yield* authoringSessions.load({
					projectRoot,
					sessionId: intent.sessionId
				});
				if (session.lifecycle !== "active") {
					return mapReviewAuthoringFailure({
						message:
							"Reframe before requesting previews for a stale or completed session.",
						recovery:
							"Use Reframe selected actor to regenerate reviewable candidates."
					});
				}
				const candidate = session.candidates.find(
					(item) => item.id === intent.candidateId
				);
				if (!candidate) {
					return mapReviewAuthoringFailure({
						message: `Candidate ${intent.candidateId} is no longer available.`
					});
				}

				const nowMs = yield* Clock.currentTimeMillis;
				const cachedPlay = yield* Ref.get(playActiveCache);
				const playActive = yield* Option.match(cachedPlay, {
					onNone: () =>
						editorSession.status(configuration.remoteControlEndpoint).pipe(
							Effect.map(
								(playState) =>
									playState.state.status === "running" ||
									playState.state.status === "paused"
							),
							Effect.tap((active) =>
								Ref.set(
									playActiveCache,
									Option.some({ active, checkedAtMs: nowMs })
								)
							),
							Effect.orElseSucceed(() => false)
						),
					onSome: (cached) =>
						nowMs - cached.checkedAtMs < 2_000
							? Effect.succeed(cached.active)
							: editorSession.status(configuration.remoteControlEndpoint).pipe(
									Effect.map(
										(playState) =>
											playState.state.status === "running" ||
											playState.state.status === "paused"
									),
									Effect.tap((active) =>
										Ref.set(
											playActiveCache,
											Option.some({ active, checkedAtMs: nowMs })
										)
									),
									Effect.orElseSucceed(() => false)
								)
				});

				if (playActive) {
					const bindings = yield* liveEnsureGate.withPermits(1)(
						Effect.gen(function* () {
							const cached = yield* Ref.get(livePreviewBindings);
							if (
								Option.isSome(cached) &&
								cached.value.sessionId === intent.sessionId
							) {
								return cached.value.bindings;
							}
							return yield* coordinator.exclusive(
								ensureReviewPreviewSources(
									configuration.remoteControlEndpoint,
									session.candidates.map((item) => ({
										candidateId: item.id,
										fieldOfViewDegrees: item.approvedPose.fieldOfViewDegrees,
										height: 180,
										location: item.approvedPose.location,
										rotation: item.approvedPose.rotation,
										width: 320
									}))
								).pipe(
									Effect.provideService(RemoteControlClient, remoteControl),
									Effect.tap((next) =>
										Ref.set(
											livePreviewBindings,
											Option.some({
												bindings: next.map((item) => ({
													candidateId: item.candidateId,
													index: item.index
												})),
												sessionId: intent.sessionId
											})
										)
									)
								)
							);
						})
					);
					const binding = bindings.find((item) => item.candidateId === candidate.id);
					if (!binding) {
						return mapReviewAuthoringFailure({
							message: `Live preview camera for ${candidate.id} was not registered.`,
							recovery: "Stop and restart PIE, then reframe the subject."
						});
					}
					const frame = yield* awaitReviewPreviewFrame({
						cameraIndex: binding.index,
						latestFrames: cameraFeed.latestFrames,
						timeout: "3 seconds"
					});
					return {
						bytes: frame.pixels,
						diagnostics: [],
						height: frame.height,
						pixelFormat: "bgra8" as const,
						status: "ready" as const,
						width: frame.width
					};
				}

				yield* Ref.set(livePreviewBindings, Option.none());
				return yield* coordinator.exclusive(
					Effect.gen(function* () {
						const reviewSet =
							session.pendingReviewSet ??
							(yield* repository.loadSet(session.reviewSet.path));
						const view = reviewSet.views.find((item) => item.id === session.viewId);
						const profile =
							(view === undefined
								? undefined
								: reviewSet.captureProfiles.find(
										(item) => item.id === view.captureProfileId
									)) ?? reviewSet.captureProfiles[0];
						if (!profile) {
							return mapReviewAuthoringFailure({
								message: "The Review Set has no capture profile for previews.",
								recovery:
									"Add a capture profile to the Review Set, then reframe the subject."
							});
						}
						const subject = yield* authoring.inspectSubject({
							actorPath: session.subject.actorPath,
							endpoint: configuration.remoteControlEndpoint
						});
						if (subject.status === "failed") {
							return mapReviewAuthoringFailure({
								message: subject.message,
								recovery: subject.recovery
							});
						}
						const preview = yield* authoring.previewCandidate({
							candidate,
							endpoint: configuration.remoteControlEndpoint,
							mapPath: session.subject.mapPath,
							profile: { ...profile, resolution: { height: 180, width: 320 } },
							subject: {
								actorPath: subject.actorPath,
								displayName: subject.displayName
							}
						});
						const updated = yield* authoringSessions.recordProjection({
							candidateId: candidate.id,
							projectRoot,
							projection: preview.projection,
							sessionId: session.id
						});
						const realization = updated.realizations.find(
							(item) => item.candidateId === candidate.id
						);
						return {
							bytes: preview.bytes,
							diagnostics: realization?.diagnostics ?? [],
							height: preview.height,
							pixelFormat: "png" as const,
							projection: preview.projection,
							status: "ready" as const,
							width: preview.width
						};
					})
				);
			}).pipe(Effect.catch((cause) => Effect.succeed(mapReviewAuthoringFailure(cause))));
		});

		const approveAuthoring = Effect.fn("Workbench.WorkbenchMapReview.approveAuthoring")(
			function* (intent: MapReviewAuthoringSessionIntent) {
				if (reviewProject === undefined) {
					return mapReviewAuthoringFailure({
						message: "No review project is configured."
					});
				}
				const projectRoot = reviewProject.projectRoot;
				return yield* coordinator.exclusive(
					authoringSessions
						.approve({
							endpoint: configuration.remoteControlEndpoint,
							projectRoot,
							sessionId: intent.sessionId
						})
						.pipe(
							Effect.flatMap((result) =>
								Effect.gen(function* () {
									if (
										result.status === "resumable" &&
										result.session.lifecycle === "approved"
									) {
										yield* Ref.set(
											activeReviewSetPath,
											Option.some(result.session.reviewSet.path)
										);
										const candidateId =
											result.session.selectedCandidateId ??
											result.session.candidates[0]?.id;
										return candidateId === undefined
											? mapReviewAuthoringFailure({
													message: "No candidate was approved."
												})
											: { candidateId, status: "approved" as const };
									}
									const recovery =
										result.status === "resumable"
											? "The authoring session was not approved. Reframe before keeping a Review View."
											: result.recovery;
									return mapReviewAuthoringFailure({
										message:
											"The authoring session became stale before approval.",
										recovery
									});
								})
							),
							Effect.catch((cause) =>
								Effect.succeed(mapReviewAuthoringFailure(cause))
							)
						)
				);
			}
		);

		const previewCandidate = Effect.fn("Workbench.WorkbenchMapReview.previewCandidate")(
			function* (candidateId: string) {
				if (configuration.review.status !== "configured") {
					return mapReviewAuthoringFailure({
						message: "No review project is configured."
					});
				}
				const { reviewSetPath } = configuration.review;
				return yield* coordinator.exclusive(
					Effect.gen(function* () {
						const reviewSet = yield* repository.loadSet(reviewSetPath);
						const selection = yield* authoring.inspectSelection(
							configuration.remoteControlEndpoint
						);
						if (selection.status === "failed") {
							return {
								error: { message: selection.message, recovery: selection.recovery },
								status: "failed" as const
							};
						}
						const candidate = generateFramingCandidates(selection).find(
							(candidate) => candidate.id === candidateId
						);
						if (!candidate) {
							return mapReviewAuthoringFailure({
								message: `Candidate ${candidateId} is no longer available.`
							});
						}
						const view = reviewSet.views[0];
						const profile =
							(view === undefined
								? undefined
								: reviewSet.captureProfiles.find(
										(candidate) => candidate.id === view.captureProfileId
									)) ?? reviewSet.captureProfiles[0];
						if (!profile) {
							return mapReviewAuthoringFailure({
								message: "The Review Set has no capture profile for previews.",
								recovery:
									"Add a capture profile to the Review Set, then reframe the subject."
							});
						}
						const preview = yield* authoring.previewCandidate({
							candidate,
							endpoint: configuration.remoteControlEndpoint,
							mapPath: selection.mapPath,
							profile: { ...profile, resolution: { height: 180, width: 320 } },
							subject: {
								actorPath: selection.actorPath,
								displayName: selection.displayName
							}
						});
						return { ...preview, status: "ready" as const };
					}).pipe(
						Effect.catch((cause) => Effect.succeed(mapReviewAuthoringFailure(cause)))
					)
				);
			}
		);

		const approveCandidate = Effect.fn("Workbench.WorkbenchMapReview.approveCandidate")(
			function* (intent: MapReviewApproveCandidateIntent) {
				if (configuration.review.status !== "configured") {
					return mapReviewAuthoringFailure({
						message: "No review project is configured."
					});
				}
				const { reviewSetPath } = configuration.review;
				return yield* Effect.gen(function* () {
					const reviewSet = yield* repository.loadSet(reviewSetPath);
					const selection = yield* authoring.inspectSelection(
						configuration.remoteControlEndpoint
					);
					if (selection.status === "failed") {
						return {
							error: { message: selection.message, recovery: selection.recovery },
							status: "failed" as const
						};
					}
					if (selection.actorPath !== intent.sourceActorPath) {
						return mapReviewAuthoringFailure({
							message:
								"The selected actor changed after these framing candidates were generated. Reframe the selected actor before keeping a view."
						});
					}
					const candidate = generateFramingCandidates(selection).find(
						(candidate) => candidate.id === intent.candidateId
					);
					if (!candidate) {
						return mapReviewAuthoringFailure({
							message: `Candidate ${intent.candidateId} is no longer available.`
						});
					}
					if (
						JSON.stringify(candidate.approvedPose) !==
						JSON.stringify(intent.candidatePose)
					) {
						return mapReviewAuthoringFailure({
							message:
								"The selected actor bounds or framing inputs changed after this preview was generated. Reframe before keeping the view so the saved pose matches what you reviewed."
						});
					}
					const approved = approveFramingCandidate({
						candidate,
						...(intent.manualPose ? { manualPose: intent.manualPose } : {}),
						...(intent.manualReason ? { manualReason: intent.manualReason } : {}),
						reviewSet,
						subject: {
							actorPath: selection.actorPath,
							diagnosticLabel: selection.displayName,
							kind: "actor_path"
						},
						viewId: ReviewViewId.make(intent.viewId)
					});
					if (approved.status === "view_not_found") {
						return mapReviewAuthoringFailure({
							message: `Review View ${approved.viewId} was not found.`
						});
					}
					yield* repository.saveSet({
						path: reviewSetPath,
						reviewSet: approved.reviewSet
					});
					return { candidateId: candidate.id, status: "approved" as const };
				}).pipe(Effect.catch((cause) => Effect.succeed(mapReviewAuthoringFailure(cause))));
			}
		);

		return WorkbenchMapReview.of({
			approveAuthoring,
			approveCandidate,
			authoringPatch,
			authoringReframe,
			authoringResume,
			authorFromSelection,
			capture: captureAndReload,
			discardAuthoring,
			focusActor,
			load,
			previewAuthoringCandidate,
			previewCandidate,
			worldSnapshot
		});
	})
);

export function makeWorkbenchMapReviewTestLayer(
	service: WorkbenchMapReviewShape
): Layer.Layer<WorkbenchMapReview> {
	return Layer.succeed(WorkbenchMapReview, WorkbenchMapReview.of(service));
}
