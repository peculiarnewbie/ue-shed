import type { MapReviewClient } from "@ue-shed/extension-camera-review/client";
import {
	decodeMapReviewApprovalResult,
	decodeMapReviewAuthoringResult,
	decodeMapReviewCandidatePreviewResult,
	decodeMapReviewResult
} from "@ue-shed/cameras/review-contracts";
import { Effect } from "effect";

export const mapReviewClient: MapReviewClient = {
	approveCandidate: async (intent) =>
		Effect.runPromise(
			decodeMapReviewApprovalResult(await window.ueShed.mapReview.approveCandidate(intent))
		),
	authorFromSelection: async () => {
		const launch = await window.ueShed.fixture.launchReview();
		if (launch.status === "failed") {
			return {
				error: { message: launch.message, recovery: launch.recovery },
				status: "failed"
			};
		}
		return Effect.runPromise(
			decodeMapReviewAuthoringResult(await window.ueShed.mapReview.authorFromSelection())
		);
	},
	capture: async () =>
		Effect.runPromise(decodeMapReviewResult(await window.ueShed.mapReview.capture())),
	load: async () =>
		Effect.runPromise(decodeMapReviewResult(await window.ueShed.mapReview.load())),
	previewCandidate: async (candidateId) =>
		Effect.runPromise(
			decodeMapReviewCandidatePreviewResult(
				await window.ueShed.mapReview.previewCandidate(candidateId)
			)
		)
};
