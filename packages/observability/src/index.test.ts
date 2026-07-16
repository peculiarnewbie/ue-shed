import { InMemorySpanExporter, SimpleSpanProcessor } from "@opentelemetry/sdk-trace-base";
import { it } from "@effect/vitest";
import { ConfigProvider, Effect, Metric } from "effect";
import { expect } from "vitest";
import {
	aggregateHealth,
	defaultHealthInput,
	observeOperation,
	operationMetrics,
	RuntimeHealthService,
	runtimeObservabilityLayer
} from "./index.js";

it.effect("captures a named domain operation through the real runtime telemetry layer", () => {
	const exporter = new InMemorySpanExporter();
	return Effect.gen(function* () {
		expect(yield* observeOperation("Authoring.testOperation", Effect.succeed("done"))).toBe(
			"done"
		);
		yield* Effect.tryPromise(() => exporter.forceFlush());
		const span = exporter
			.getFinishedSpans()
			.find(({ name }) => name === "Authoring.testOperation");
		expect(span?.attributes.operation).toBe("Authoring.testOperation");
	}).pipe(
		Effect.provide(
			runtimeObservabilityLayer({
				serviceName: "ue-shed-test",
				spanProcessor: new SimpleSpanProcessor(exporter)
			})
		),
		Effect.provide(
			ConfigProvider.layer(ConfigProvider.fromUnknown({ UE_SHED_TELEMETRY_MODE: "disabled" }))
		)
	);
});

it.effect("updates operation traffic, error, and latency metrics", () =>
	Effect.gen(function* () {
		const beforeTraffic = yield* Metric.value(operationMetrics.traffic);
		const beforeErrors = yield* Metric.value(operationMetrics.errors);
		yield* observeOperation("Observability.success", Effect.void);
		yield* observeOperation("Observability.failure", Effect.fail("expected")).pipe(
			Effect.ignore
		);
		const afterTraffic = yield* Metric.value(operationMetrics.traffic);
		const afterErrors = yield* Metric.value(operationMetrics.errors);
		const latency = yield* Metric.value(operationMetrics.latency);
		expect(afterTraffic.count - beforeTraffic.count).toBe(2);
		expect(afterErrors.count - beforeErrors.count).toBe(1);
		expect(latency.count).toBeGreaterThanOrEqual(2);
	})
);

it.effect("provides disabled and console telemetry modes through Effect Config", () =>
	Effect.gen(function* () {
		const health = yield* RuntimeHealthService;
		expect((yield* health.snapshot()).telemetry).toBe("ready");
	}).pipe(
		Effect.provide(runtimeObservabilityLayer({ serviceName: "ue-shed-test" })),
		Effect.provide(
			ConfigProvider.layer(ConfigProvider.fromUnknown({ UE_SHED_TELEMETRY_MODE: "console" }))
		)
	)
);

it("aggregates optional absence, reconnection, required failures, and telemetry gaps", () => {
	expect(
		aggregateHealth({
			...defaultHealthInput,
			capabilities: [{ available: false, name: "review", required: false }]
		}).status
	).toBe("healthy");
	expect(aggregateHealth({ ...defaultHealthInput, connection: "reconnecting" }).status).toBe(
		"degraded"
	);
	expect(
		aggregateHealth({
			...defaultHealthInput,
			capabilities: [{ available: false, name: "authoring", required: true }]
		}).status
	).toBe("unhealthy");
	expect(aggregateHealth({ ...defaultHealthInput, telemetry: "degraded" }).status).toBe(
		"degraded"
	);
});
