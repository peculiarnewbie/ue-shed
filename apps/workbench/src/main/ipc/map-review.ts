import type {
	MapReviewApproveCandidateIntent,
	MapReviewAuthoringPatchIntent,
	MapReviewAuthoringPreviewIntent,
	MapReviewAuthoringSessionIntent,
	MapReviewCaptureIntent
} from "@ue-shed/cameras/review-contracts";
import { Effect } from "effect";
import { ElectronIpc } from "../adapters/electron-ipc.js";
import { invokeContracts, type CandidateId } from "../ipc-contracts.js";
import type { ActorId } from "@ue-shed/observatory";
import { WorkbenchMapReview } from "../services/map-review.js";

export const register = Effect.gen(function* () {
	const ipc = yield* ElectronIpc;
	const mapReview = yield* WorkbenchMapReview;

	yield* ipc.register(invokeContracts["map-review:load"], () => mapReview.load());
	yield* ipc.register(invokeContracts["map-review:capture"], (...args) => {
		const [intent] = args as [MapReviewCaptureIntent];
		return mapReview.capture(intent);
	});
	yield* ipc.register(invokeContracts["map-review:world-snapshot"], () =>
		mapReview.worldSnapshot()
	);
	yield* ipc.register(invokeContracts["map-review:focus-actor"], (...args) => {
		const [actorId, bringToFront] = args as [ActorId, boolean];
		return mapReview.focusActor(actorId, bringToFront);
	});
	yield* ipc.register(invokeContracts["map-review:author-from-selection"], () =>
		mapReview.authorFromSelection()
	);
	yield* ipc.register(invokeContracts["map-review:authoring-resume"], () =>
		mapReview.authoringResume(undefined)
	);
	yield* ipc.register(invokeContracts["map-review:authoring-patch"], (...args) => {
		const [intent] = args as [MapReviewAuthoringPatchIntent];
		return mapReview.authoringPatch(intent);
	});
	yield* ipc.register(invokeContracts["map-review:authoring-reframe"], (...args) => {
		const [intent] = args as [MapReviewAuthoringSessionIntent];
		return mapReview.authoringReframe(intent);
	});
	yield* ipc.register(invokeContracts["map-review:authoring-discard"], (...args) => {
		const [intent] = args as [MapReviewAuthoringSessionIntent];
		return mapReview.discardAuthoring(intent);
	});
	yield* ipc.register(invokeContracts["map-review:preview-authoring-candidate"], (...args) => {
		const [intent] = args as [MapReviewAuthoringPreviewIntent];
		return mapReview.previewAuthoringCandidate(intent);
	});
	yield* ipc.register(invokeContracts["map-review:approve-authoring"], (...args) => {
		const [intent] = args as [MapReviewAuthoringSessionIntent];
		return mapReview.approveAuthoring(intent);
	});
	yield* ipc.register(invokeContracts["map-review:preview-candidate"], (...args) => {
		const [candidateId] = args as [CandidateId];
		return mapReview.previewCandidate(candidateId);
	});
	yield* ipc.register(invokeContracts["map-review:approve-candidate"], (...args) => {
		const [intent] = args as [MapReviewApproveCandidateIntent];
		return mapReview.approveCandidate(intent);
	});
}).pipe(Effect.withSpan("Workbench.Ipc.registerMapReview"));
