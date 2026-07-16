import {
	approveFramingCandidate,
	generateFramingCandidates,
	ReviewAuthoring,
	ReviewCapture,
	ReviewRepository,
	ReviewViewId,
	type CaptureRunSummary,
	type ReviewSet
} from "@ue-shed/cameras";
import type {
	MapReviewApprovalResult,
	MapReviewApproveCandidateIntent,
	MapReviewAuthoringResult,
	MapReviewCandidatePreviewResult,
	MapReviewResult,
	MapReviewRunView
} from "@ue-shed/cameras/review-contracts";
import { Context, Effect, Layer } from "effect";
import { dirname } from "node:path";
import { LocalFiles } from "../adapters/local-files.js";
import { WorkbenchConfiguration } from "../workbench-config.js";

const artifactReadConcurrency = 4;

interface ReviewFailure {
	readonly error: { readonly message: string; readonly recovery: string };
	readonly status: "failed";
}

export interface WorkbenchMapReviewShape {
	readonly approveCandidate: (
		intent: MapReviewApproveCandidateIntent
	) => Effect.Effect<MapReviewApprovalResult>;
	readonly authorFromSelection: () => Effect.Effect<MapReviewAuthoringResult>;
	readonly capture: () => Effect.Effect<MapReviewResult>;
	readonly load: () => Effect.Effect<MapReviewResult>;
	readonly previewCandidate: (
		candidateId: string
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

export const WorkbenchMapReviewLive = Layer.effect(
	WorkbenchMapReview,
	Effect.gen(function* () {
		const configuration = yield* WorkbenchConfiguration;
		const localFiles = yield* LocalFiles;
		const repository = yield* ReviewRepository;
		const capture = yield* ReviewCapture;
		const authoring = yield* ReviewAuthoring;

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
			if (configuration.review.status !== "configured")
				return { status: "not_configured" as const };
			const { projectRoot, reviewSetPath } = configuration.review;
			return yield* Effect.gen(function* () {
				const reviewSet = yield* repository.loadSet(reviewSetPath);
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
						viewCount: reviewSet.views.length
					},
					runs,
					status: "ready" as const
				};
			}).pipe(Effect.catch((cause) => Effect.succeed(mapReviewFailure(cause))));
		});

		const captureAndReload = Effect.fn("Workbench.WorkbenchMapReview.capture")(function* () {
			if (configuration.review.status !== "configured")
				return { status: "not_configured" as const };
			const { projectRoot, reviewSetPath } = configuration.review;
			return yield* capture
				.captureSet({
					endpoint: configuration.remoteControlEndpoint,
					projectRoot,
					reviewSetPath
				})
				.pipe(
					Effect.flatMap(() => load()),
					Effect.catch((cause) => Effect.succeed(mapReviewFailure(cause)))
				);
		});

		const authorFromSelection = Effect.fn("Workbench.WorkbenchMapReview.authorFromSelection")(
			function* () {
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
					if (selection.mapPath !== reviewSet.project.mapPath) {
						return mapReviewAuthoringFailure({
							message: `The selected actor belongs to ${selection.mapPath}, not ${reviewSet.project.mapPath}.`,
							recovery:
								"Open the Review Set map and select exactly one subject actor."
						});
					}
					const view = reviewSet.views[0];
					if (!view) {
						return mapReviewAuthoringFailure({
							message: "The configured Review Set has no Review View to reframe."
						});
					}
					const profile = reviewSet.captureProfiles.find(
						(candidate) => candidate.id === view.captureProfileId
					);
					if (!profile) {
						return mapReviewAuthoringFailure({
							message: `Review View ${view.id} has no capture profile.`
						});
					}
					const candidates = generateFramingCandidates(selection);
					return {
						candidates: candidates.map((candidate) => ({
							diagnostics: candidate.diagnostics,
							displayName: candidate.displayName,
							id: candidate.id,
							pose: candidate.approvedPose,
							preset: candidate.recipe.preset,
							preview: { status: "pending" as const }
						})),
						selection: {
							actorPath: selection.actorPath,
							displayName: selection.displayName,
							mapPath: selection.mapPath
						},
						status: "ready" as const,
						viewId: view.id
					};
				}).pipe(Effect.catch((cause) => Effect.succeed(mapReviewAuthoringFailure(cause))));
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
					const candidate = generateFramingCandidates(selection).find(
						(candidate) => candidate.id === candidateId
					);
					if (!candidate) {
						return mapReviewAuthoringFailure({
							message: `Candidate ${candidateId} is no longer available.`
						});
					}
					const view = reviewSet.views[0];
					const profile = view
						? reviewSet.captureProfiles.find(
								(candidate) => candidate.id === view.captureProfileId
							)
						: undefined;
					if (!profile) {
						return mapReviewAuthoringFailure({
							message: "The Review View has no capture profile for previews."
						});
					}
					const preview = yield* authoring.previewCandidate({
						candidate,
						endpoint: configuration.remoteControlEndpoint,
						mapPath: selection.mapPath,
						profile: { ...profile, resolution: { height: 360, width: 640 } },
						subject: {
							actorPath: selection.actorPath,
							displayName: selection.displayName
						}
					});
					return { ...preview, status: "ready" as const };
				}).pipe(Effect.catch((cause) => Effect.succeed(mapReviewAuthoringFailure(cause))));
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
			approveCandidate,
			authorFromSelection,
			capture: captureAndReload,
			load,
			previewCandidate
		});
	})
);

export function makeWorkbenchMapReviewTestLayer(
	service: WorkbenchMapReviewShape
): Layer.Layer<WorkbenchMapReview> {
	return Layer.succeed(WorkbenchMapReview, WorkbenchMapReview.of(service));
}
