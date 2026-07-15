# Effect

Effect is the application core and the canonical public workflow type. It owns composition for
stateful and effectful modules, not only code at external boundaries.

## Use it for

- services and dependency wiring;
- resource setup and cleanup;
- Unreal, files, processes, sockets, and pipes;
- concurrency, cancellation, schedules, and timeouts;
- bounded queues, streams, and reconnect flows;
- config, Effect Schema, typed errors, logs, traces, and metrics.

Keep pure calculations as plain functions. Effect is not part of the wire protocol.

## Rules

- Give each external library one adapter service.
- Expose every stateful or effectful module through `Context.Service` and layers.
- Name public and non-trivial internal operations with `Effect.fn("Domain.operation")`.
- Use Effect Schema for TypeScript-owned domain values and boundary validation.
- Expose domain actions, not raw library clients.
- Use Layers for setup and tests, not hidden global access.
- Scope resources and release them on success, failure, and cancellation.
- Keep errors typed until the right boundary can translate them.
- Make timeouts, retries, and queue limits explicit.
- Adapt Promise APIs once. Avoid Promise/Effect ping-pong.
- Restrict `Effect.run*` to runtime exits and explicit Electron, browser, Node, or third-party
  framework adapters.
- Use the simplest concurrency tool that works.

Pure transformations remain plain immutable functions and compose inside workflows. An exemption
for a measured hot path requires a benchmark and a documented adapter boundary.

`pnpm effect:architecture` prevents new runtime exits, public Promise surfaces, direct environment
reads, and raw fetch calls outside the reviewed migration baseline. Change that baseline only for a
documented foreign-framework adapter or benchmarked exception.

## Tests

Test success, typed failure, cancellation, cleanup, timeout, retry limits, and concurrency. Use real
temporary files, local servers, pipes, and child processes when they are cheap.

Check `effect-solutions` when supported. Otherwise use current official docs and installed source.
Choose one Effect major version and do not mix examples from other versions.
