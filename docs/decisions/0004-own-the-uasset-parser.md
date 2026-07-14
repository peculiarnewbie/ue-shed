# 0004: Own the native UAsset parser in UE Shed

## Status

Accepted for the saved-package proving slices.

## Context

DataTable authoring inspection and texture audits both require the same native saved-package reader.
Keeping that reader in an unpublished, independently checked-out project made a fresh clone unable
to run two of the three showcase slices and prevented fixture, schema, and parser changes from being
verified atomically.

The source project had also grown a UTrace parser, capture analysis, dashboards, and WASM concerns.
Those capabilities are much larger than the UAsset boundary and have a different product lifecycle.

## Decision

- UE Shed owns `crates/uasset-parser`, its Rust library, native `uasset` CLI, tests, and lockfile.
- The versioned JSON process contract remains the integration boundary. TypeScript packages do not
  link to Rust or depend on its internal model.
- Source-checkout launchers incrementally build the debug executable when no explicit
  `UE_SHED_UASSET_EXECUTABLE` override is supplied.
- `pnpm check` verifies formatting, Clippy, and tests for the Rust crate, and the TypeScript fixture
  tests run against the resulting native binary.
- UTrace parsing, its analysis model, dashboards, and WASM targets are not extracted into UE Shed.
- Prebuilt binary distribution is deferred until release provenance and platform packaging are
  ready; the source checkout requires a Rust toolchain in the meantime.

## Consequences

A fresh development clone has one trusted source and test boundary for the two saved-package demos.
Published `@ue-shed/unreal-assets` consumers remain free to select a compatible executable through an
option, environment configuration, or `PATH`, so the TypeScript package is not coupled to this
monorepo layout. UTrace can become its own repository or package without forcing its size and release
cadence onto the foundational parser.
