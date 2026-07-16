import { NodeSdk } from "@effect/opentelemetry";
import { ConsoleLogRecordExporter, SimpleLogRecordProcessor } from "@opentelemetry/sdk-logs";
import { ConsoleMetricExporter, PeriodicExportingMetricReader } from "@opentelemetry/sdk-metrics";
import {
	ConsoleSpanExporter,
	SimpleSpanProcessor,
	type SpanProcessor
} from "@opentelemetry/sdk-trace-base";
import { Config, Effect, Exit, Layer, Metric, Schema } from "effect";
import { defaultHealthInput, runtimeHealthLayer } from "./health.js";

export * from "./health.js";

export const TelemetryMode = Schema.Literals(["disabled", "console"]);
export type TelemetryMode = typeof TelemetryMode.Type;

const operationTraffic = Metric.counter("ue_shed_operation_total", {
	description: "Completed UE Shed runtime operations",
	incremental: true
});
const operationErrors = Metric.counter("ue_shed_operation_error_total", {
	description: "Failed UE Shed runtime operations",
	incremental: true
});
const operationLatency = Metric.histogram("ue_shed_operation_duration_ms", {
	boundaries: [1, 5, 10, 25, 50, 100, 250, 500, 1_000, 5_000, 30_000],
	description: "UE Shed operation duration in milliseconds"
});
export const queueDepth = Metric.gauge("ue_shed_queue_depth", {
	description: "Current bounded queue depth"
});
export const streamDrops = Metric.counter("ue_shed_stream_drop_total", {
	description: "Dropped stream items",
	incremental: true
});
export const streamGaps = Metric.counter("ue_shed_stream_gap_total", {
	description: "Detected stream gaps",
	incremental: true
});
export const cameraReplacements = Metric.counter("ue_shed_camera_replacement_total", {
	description: "Camera frames replaced by bounded delivery",
	incremental: true
});
export const authoringTransitions = Metric.frequency("ue_shed_authoring_transition_total", {
	description: "Apply and Save authority transition outcomes"
});
export const coverage = Metric.gauge("ue_shed_coverage_ratio", {
	description: "Domain coverage ratio from zero to one"
});

export const operationMetrics = {
	errors: operationErrors,
	latency: operationLatency,
	traffic: operationTraffic
};

export function recordStreamState(state: {
	readonly drops: number;
	readonly gaps: number;
	readonly queueDepth: number;
}): Effect.Effect<void> {
	return Effect.all([
		Metric.update(queueDepth, state.queueDepth),
		Metric.update(streamDrops, state.drops),
		Metric.update(streamGaps, state.gaps)
	]).pipe(Effect.asVoid);
}

export const recordCameraReplacements = (count: number): Effect.Effect<void> =>
	Metric.update(cameraReplacements, count);

export const recordAuthoringTransition = (transition: string): Effect.Effect<void> =>
	Metric.update(authoringTransitions, transition);

export const recordCoverage = (ratio: number): Effect.Effect<void> =>
	Metric.update(coverage, Math.max(0, Math.min(1, ratio)));

export function observeOperation<A, E, R>(
	name: string,
	effect: Effect.Effect<A, E, R>
): Effect.Effect<A, E, R> {
	return Effect.gen(function* () {
		const started = yield* Effect.clockWith((clock) => clock.currentTimeMillis);
		const exit = yield* Effect.exit(effect);
		const finished = yield* Effect.clockWith((clock) => clock.currentTimeMillis);
		yield* Metric.update(operationTraffic, 1);
		yield* Metric.update(operationLatency, Math.max(0, finished - started));
		if (Exit.isFailure(exit)) yield* Metric.update(operationErrors, 1);
		return yield* exit;
	}).pipe(Effect.withSpan(name), Effect.annotateSpans("operation", name));
}

const telemetryModeConfig = Config.literals(["disabled", "console"], "UE_SHED_TELEMETRY_MODE").pipe(
	Config.withDefault("disabled")
);

export interface RuntimeObservabilityOptions {
	readonly serviceName: string;
	readonly serviceVersion?: string;
	readonly spanProcessor?: SpanProcessor;
}

function sdkLayer(options: RuntimeObservabilityOptions, mode: TelemetryMode) {
	if (mode === "disabled" && options.spanProcessor === undefined) return NodeSdk.layerEmpty;
	const spanProcessor =
		options.spanProcessor ?? new SimpleSpanProcessor(new ConsoleSpanExporter());
	return NodeSdk.layer(() => ({
		logRecordProcessor:
			mode === "console"
				? new SimpleLogRecordProcessor(new ConsoleLogRecordExporter())
				: undefined,
		metricReader:
			mode === "console"
				? new PeriodicExportingMetricReader({
						exporter: new ConsoleMetricExporter(),
						exportIntervalMillis: 30_000
					})
				: undefined,
		resource: {
			serviceName: options.serviceName,
			...(options.serviceVersion === undefined
				? {}
				: { serviceVersion: options.serviceVersion })
		},
		spanProcessor
	}));
}

export function runtimeObservabilityLayer(options: RuntimeObservabilityOptions) {
	return Layer.unwrap(
		Effect.map(telemetryModeConfig, (mode) =>
			Layer.merge(
				sdkLayer(options, mode),
				runtimeHealthLayer({
					...defaultHealthInput,
					telemetry: mode === "disabled" ? "disabled" : "ready"
				})
			)
		)
	);
}
