/**
 * Browser-safe Observatory surface for World Scout presentation.
 * Avoids Node-only feed/protocol modules (`node:net`, `Buffer` encoders).
 */
export * from "./actor-models.js";
export { actorInstanceKey, remapObservedActorId } from "./actor-identity.js";
export {
	applyTransformBatch,
	applyWorldObservationEvent,
	CatalogRevision,
	catalogEntryAt,
	catalogFromSnapshot,
	catalogFromWireEntries,
	connectingState,
	materializeObservedActor,
	ObservationSessionId,
	PacketSequence,
	StreamActorIndex,
	WorldActorCatalog,
	WorldActorCatalogEntry,
	WorldIndexedTransform,
	WorldObservationHealth,
	WorldTransform,
	WorldTransformBatch
} from "./world-observation.js";
export type {
	WorldObservationApplyResult,
	WorldObservationEvent,
	WorldObservationRejectReason,
	WorldObservationSample,
	WorldObservationState,
	WorldTransformStore
} from "./world-observation.js";
