# Functional design

## Functional programming with an Effect core

Use immutable values, algebraic data types, exhaustive matching, and composition by default. Effect
owns application workflows and policy wherever state, failure, concurrency, configuration,
resources, telemetry, or external interaction is involved.

Pure code should handle folds, diffs, validation, state changes, compatibility, scheduling policy, and
timeline edits.

Pure functions remain normal building blocks inside Effect workflows. They do not form a second
runtime or own effectful workflow policy. Effect handles clocks, config, files, processes, sockets,
pipes, Unreal, queues, streams, services, and telemetry.

Do not wrap a trivial deterministic calculation only for appearances. Do not hide state in globals
or pass ad-hoc dependency bags through workflows; define services and layers. Obtain clocks,
configuration, and seeded randomness from the Effect environment when behavior depends on them.

## State

- Prefer immutable values.
- Return the next state instead of mutating shared state.
- Use unions instead of boolean flag bags.
- Put needed mutation behind a small tested interface.
- Make ownership, cancellation, queue limits, and retention clear.
- Prefer object arguments for non-trivial calls.

Domain packages must not depend on Workbench. A test or CLI should be able to run the same behavior.
