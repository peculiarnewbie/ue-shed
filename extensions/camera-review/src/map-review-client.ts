import type {
	MapReviewApprovalResult,
	MapReviewApproveCandidateIntent,
	MapReviewAuthoringResult,
	MapReviewCandidatePreviewResult,
	MapReviewResult
} from "@ue-shed/cameras/review-contracts";

export type {
	MapReviewApprovalResult,
	MapReviewApproveCandidateIntent,
	MapReviewAuthoringCandidate,
	MapReviewAuthoringResult,
	MapReviewCandidatePreviewResult,
	MapReviewPose,
	MapReviewResult,
	MapReviewRunView
} from "@ue-shed/cameras/review-contracts";

export interface MapReviewClient {
	readonly approveCandidate: (
		intent: MapReviewApproveCandidateIntent
	) => Promise<MapReviewApprovalResult>;
	readonly authorFromSelection: () => Promise<MapReviewAuthoringResult>;
	readonly capture: () => Promise<MapReviewResult>;
	readonly load: () => Promise<MapReviewResult>;
	readonly previewCandidate: (candidateId: string) => Promise<MapReviewCandidatePreviewResult>;
}
