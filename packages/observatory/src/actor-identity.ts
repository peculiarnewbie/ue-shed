import {
	type ActorId as ActorIdType,
	type ObservedActor as ObservedActorType
} from "./actor-models.js";

/** Stable key across editor ↔ PIE path prefixes for the same placed instance. */
export function actorInstanceKey(actor: Pick<ObservedActorType, "className" | "path">): string {
	const leaf = actor.path.split(".").at(-1) ?? actor.path;
	const persistent = leaf.includes("PersistentLevel.")
		? leaf.slice(leaf.indexOf("PersistentLevel.") + "PersistentLevel.".length)
		: leaf.replace(/^UEDPIE_\d+_/, "");
	return `${actor.className}:${persistent}`;
}

/** Keep a scout selection when snapshot actor ids change (PLAY start/stop). */
export function remapObservedActorId(
	previousId: ActorIdType | undefined,
	previousActors: ReadonlyArray<ObservedActorType>,
	nextActors: ReadonlyArray<ObservedActorType>
): ActorIdType | undefined {
	if (previousId === undefined) return undefined;
	if (nextActors.some((actor) => actor.id === previousId)) return previousId;
	const prior = previousActors.find((actor) => actor.id === previousId);
	if (prior === undefined) return undefined;
	const key = actorInstanceKey(prior);
	return nextActors.find((actor) => actorInstanceKey(actor) === key)?.id;
}
