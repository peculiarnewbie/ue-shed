# Observability

Use traces, metrics, and structured logs. Logs alone are not enough.

Instrument:

- discovery, connection, negotiation, and reconnects;
- Unreal calls and data streams;
- queue depth, drops, gaps, and recovery;
- authoring load, validation, Apply, and Save;
- actor collection cost and coverage;
- camera capture and frame delivery;
- scenario runs, divergence, and evidence.

Spans should include safe IDs, versions, duration, result, and retry count. Metrics should cover
latency, traffic, errors, saturation, and coverage.

Do not put secrets, full user data, large payloads, or unbounded IDs in telemetry labels.

Health is a public feature. `ue-shed doctor`, CLI errors, and Workbench diagnostics must use the same
service state. Observability tools must report their own gaps, drops, cost, and limits.

## Runtime policy

`@ue-shed/observability` owns the shared runtime layer, metrics, and schema-owned health service.
The CLI and Workbench each provide that layer once at their composition root. Set
`UE_SHED_TELEMETRY_MODE=console` for local OpenTelemetry traces, metrics, and structured logs; the
default `disabled` mode requires no collector and remains healthy. Invalid explicit configuration is
a visible startup error. Runtime exporter loss is reported by setting telemetry health to `degraded`;
it must not be inferred from log text.

Health aggregation distinguishes required capability failure from optional absence. Reconnection,
stream gaps/drops, and telemetry degradation are degraded states; failed readers, failed connections,
and missing required capabilities are unhealthy. `ue-shed doctor` and the Workbench showcase consume
the same `RuntimeHealthService` snapshot.

Metric names use bounded dimensions. The shared set covers operation traffic/errors/latency, queue
depth, stream drops/gaps, camera replacements, authoring Apply/Save transitions, and domain coverage.
Operation names and transition values are finite; asset paths, payloads, image data, and user-authored
identifiers are never labels.
