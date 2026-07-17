import { AuthoringCatalogLive } from "@ue-shed/authoring-catalog";
import { AssetReaderLive } from "@ue-shed/unreal-assets";
import { RemoteControlClientLive } from "@ue-shed/unreal-connection";
import { Layer } from "effect";
import { AuthoringClientLive, ShedAuthoringLive, ShedAuthoringSessionsLive } from "./authoring.js";

const infrastructureLive = Layer.mergeAll(AssetReaderLive, RemoteControlClientLive);
const authoringCatalogLive = AuthoringCatalogLive.pipe(Layer.provide(infrastructureLive));
const authoringDependenciesLive = Layer.mergeAll(infrastructureLive, authoringCatalogLive);
const shedAuthoringLive = ShedAuthoringLive.pipe(
	Layer.provide(ShedAuthoringSessionsLive),
	Layer.provide(authoringDependenciesLive)
);

/**
 * Demo-scoped host graph for direct, trusted Node embedding of Data Authoring. The embedding
 * runtime supplies configuration, file selection, observability, and the single runtime exit.
 */
export const ShedHostLive = AuthoringClientLive.pipe(Layer.provide(shedAuthoringLive));
