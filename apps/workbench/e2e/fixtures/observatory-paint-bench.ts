import {
	ActorId,
	CatalogRevision,
	ObservationSessionId,
	PacketSequence,
	StreamActorIndex,
	WorldTransform,
	type WorldActorCatalogEntry,
	type WorldObservationSample,
	type WorldTransform as WorldTransformType
} from "@ue-shed/observatory/presentation";
import {
	collectVisibleIndices,
	contentBounds,
	createWorldScoutPaintGate,
	paintWorldScout,
	projectVisibleActors,
	resizeCanvasForDisplay,
	stabilizeViewport,
	WorldScoutRetainedStore
} from "../../../../extensions/camera-review/src/world-scout-canvas.js";

export interface ObservatoryPaintBenchOptions {
	readonly actorCount: number;
	readonly changeRatio: number;
	readonly cssHeight?: number;
	readonly cssWidth?: number;
	readonly durationMs: number;
	readonly producerHz: number;
	readonly seed?: number;
}

export interface ObservatoryPaintBenchResult {
	readonly actorCount: number;
	readonly canvasCount: number;
	readonly changeRatio: number;
	readonly frames: number;
	readonly maxPendingAfterBurst: number;
	readonly paintMs: ReadonlyArray<number>;
	readonly producerHz: number;
	readonly scheduledPaints: number;
}

function mulberry32(seed: number): () => number {
	return () => {
		let value = (seed += 0x6d2b79f5);
		value = Math.imul(value ^ (value >>> 15), value | 1);
		value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
		return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
	};
}

function percentile(sorted: ReadonlyArray<number>, ratio: number): number {
	if (sorted.length === 0) return 0;
	const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * ratio) - 1));
	return sorted[index] ?? 0;
}

function buildSample(actorCount: number): WorldObservationSample {
	const entries: WorldActorCatalogEntry[] = [];
	const transforms = new Map<StreamActorIndex, WorldTransformType>();
	for (let index = 0; index < actorCount; index += 1) {
		const streamIndex = StreamActorIndex.make(index);
		const x = (index % 64) * 250;
		const y = Math.floor(index / 64) * 250;
		entries.push({
			bounds: {
				center: { x, y, z: 0 },
				extent: { x: 40, y: 40, z: 40 }
			},
			className: index % 3 === 0 ? "Mover" : "StaticMeshActor",
			displayName: `Actor_${index}`,
			id: ActorId.make(`actor-${index}`),
			path: `/Game/Map.Map:PersistentLevel.Actor_${index}`,
			streamIndex
		});
		transforms.set(
			streamIndex,
			WorldTransform.make({
				location: { x, y, z: 0 },
				rotation: { x: 0, y: 0, z: 0 }
			})
		);
	}
	return {
		catalog: {
			capturedAt: "2026-07-21T00:00:00.000Z",
			entries,
			mapPath: "/Game/Map.Map",
			revision: CatalogRevision.make(1n),
			sessionId: ObservationSessionId.make("0123456789abcdef0123456789abcdef"),
			worldKind: "pie",
			worldSeconds: 0
		},
		health: {
			producerReplacements: 0,
			rejectedBatches: 0,
			sequenceGaps: 0
		},
		lastSequence: PacketSequence.make(0n),
		sampleWorldSeconds: 0,
		transforms
	};
}

export async function runObservatoryPaintBench(
	options: ObservatoryPaintBenchOptions
): Promise<ObservatoryPaintBenchResult> {
	const cssWidth = options.cssWidth ?? 800;
	const cssHeight = options.cssHeight ?? 800;
	const canvas = document.querySelector("#world-scout");
	if (!(canvas instanceof HTMLCanvasElement)) {
		throw new Error("Expected #world-scout canvas");
	}
	canvas.style.width = `${cssWidth}px`;
	canvas.style.height = `${cssHeight}px`;

	const store = new WorldScoutRetainedStore();
	store.installCatalog(buildSample(options.actorCount));
	const random = mulberry32(options.seed ?? 190_007);
	const changedCount = Math.max(1, Math.round(options.actorCount * options.changeRatio));
	const paintMs: number[] = [];
	let worldSeconds = 0;
	let maxPendingAfterBurst = 0;

	const paint = () => {
		const started = performance.now();
		const context = resizeCanvasForDisplay(
			canvas,
			cssWidth,
			cssHeight,
			window.devicePixelRatio || 1
		);
		if (!context) return;
		collectVisibleIndices(store, "", new Set(), store.visibleIndices);
		const bounds = contentBounds(store, store.visibleIndices);
		store.viewport = stabilizeViewport(store.viewport, bounds);
		if (store.viewport !== undefined) {
			projectVisibleActors(store, store.viewport, cssWidth, cssHeight, store.visibleIndices);
		}
		paintWorldScout(
			context,
			store,
			store.visibleIndices.length,
			undefined,
			cssWidth,
			cssHeight
		);
		paintMs.push(performance.now() - started);
	};

	const gate = createWorldScoutPaintGate(paint);
	const intervalMs = 1_000 / options.producerHz;
	const endAt = performance.now() + options.durationMs;

	await new Promise<void>((resolve) => {
		const tick = () => {
			if (performance.now() >= endAt) {
				resolve();
				return;
			}
			worldSeconds += intervalMs / 1_000;
			const changed: Array<{
				readonly streamIndex: number;
				readonly transform: WorldTransformType;
			}> = [];
			for (let offset = 0; offset < changedCount; offset += 1) {
				const streamIndex = Math.floor(random() * options.actorCount);
				const baseX = (streamIndex % 64) * 250;
				const baseY = Math.floor(streamIndex / 64) * 250;
				changed.push({
					streamIndex,
					transform: WorldTransform.make({
						location: {
							x: baseX + random() * 40,
							y: baseY + random() * 40,
							z: 0
						},
						rotation: {
							x: 0,
							y: 0,
							z: random() * 360
						}
					})
				});
			}
			store.applyTransforms(changed, worldSeconds);
			for (let burst = 0; burst < 3; burst += 1) gate.markDirty();
			if (gate.pending()) maxPendingAfterBurst = Math.max(maxPendingAfterBurst, 1);
			window.setTimeout(tick, intervalMs);
		};
		tick();
	});

	await new Promise<void>((resolve) => {
		requestAnimationFrame(() => {
			gate.flushNow();
			resolve();
		});
	});
	gate.dispose();

	return {
		actorCount: options.actorCount,
		canvasCount: document.querySelectorAll("canvas").length,
		changeRatio: options.changeRatio,
		frames: paintMs.length,
		maxPendingAfterBurst,
		paintMs,
		producerHz: options.producerHz,
		scheduledPaints: gate.scheduledCount()
	};
}

declare global {
	interface Window {
		__runObservatoryPaintBench: typeof runObservatoryPaintBench;
		__paintPercentile: typeof percentile;
	}
}

window.__runObservatoryPaintBench = runObservatoryPaintBench;
window.__paintPercentile = percentile;
