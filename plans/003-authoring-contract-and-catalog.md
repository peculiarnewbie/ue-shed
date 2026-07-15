# Plan 003: Establish the authoritative schema and DataTable catalog

> **Executor instructions**: Treat this as a cross-language contract migration. Land compatibility
> and producer conformance before switching consumers. Update `plans/README.md` when done.
>
> **Drift check**: `git diff --stat 52df5c0..HEAD -- packages/protocol packages/unreal-assets packages/unreal-connection unreal/Plugins/UEShedAuthoring fixtures apps/cli apps/workbench extensions/data-authoring`

## Status

- **State**: DONE — v2 producers, saved/live catalog, CLI, Workbench explorer, and real-Unreal parity are verified
- **Priority**: P0
- **Effort**: L (multi-day)
- **Risk**: HIGH — saved, live, persisted-session, CLI, and UI consumers share this boundary
- **Depends on**: Plan 002
- **Planned at**: commit `52df5c0`, 2026-07-15

## Progress checkpoint — 2026-07-15

- Checked JSON Schema is authoritative for the v2 snapshot; v1 remains explicitly read-only.
- Rust saved snapshots emit v2 with producer/package evidence and explicit unavailable schema and
  fingerprint evidence instead of inferring either.
- Saved discovery classifies packages concurrently with per-asset diagnostics. The CLI and Workbench
  consume this public catalog, and the Workbench explorer is available before a table is open.
- The UE 5.7 reflection producer and `/Game` table-list operation compile and run in the real fixture.
  `pnpm fixture:verify` passes with zero errors.
- The public saved/live merge service, CLI catalog/parity commands, and Workbench
  authority/divergence states are implemented. `pnpm authoring:parity fixtures/unreal-project
http://127.0.0.1:30001 --reader target/debug/uasset.exe` reports all 11 tables under both
  authorities, zero divergence, and zero semantic fingerprint mismatches.
- The companion advertises optional authoring, camera, and asset-audit endpoints only while their
  modules are loaded. Game-mode clients no longer receive a false editor-authoring capability.
- Native saved packages do not establish row-structure field metadata independently. They retain
  explicit unavailable schema evidence as required by the STOP condition; the parity report keeps
  those authority-specific gaps visible while verifying saved/live semantic values.

## Outcome

An empty or populated DataTable can be discovered and described consistently from saved packages or
live Unreal. The language-neutral v2 contract carries enough schema to build honest editors without
inferring columns from the first row. CLI and Workbench expose a real project catalog instead of
requiring a known asset path or file picker.

## Required contract

Define the versioned schema in a language-neutral source, then generate/validate TypeScript, JSON
Schema, Rust output, and C++ output against it. At minimum include:

- canonical object/package paths, stable table/row/field identities, row struct, authority, producer
  version, provenance, completeness, diagnostics, and semantic fingerprint version;
- ordered field descriptors independent of rows: Unreal property kind, nested/container shape,
  enum choices, reference target evidence, editability, optional/default evidence, and annotations
  such as read-only, deprecated, clamp, step, unit, description, and row-reference role;
- typed values that preserve exact integers, non-finite floats, opaque evidence, and all existing
  recursive values without dropping unknown fields;
- compatibility behavior for v1 snapshots and persisted drafts. No silent migration of ambiguous
  values.

The current TypeScript-first JSON Schema generator reverses ADR 0002, and current columns are derived
from row values. Correct both before editing.

## Work

1. Add failing contract tests for empty tables, inconsistent producer field order, enums, metadata,
   nested/container descriptors, opaque values, and v1 compatibility.
2. Introduce v2 schemas and generated bindings. Version fingerprint canonicalization explicitly so
   old sessions can be diagnosed or migrated deterministically.
3. Update the saved-package reader and UE 5.7 companion snapshot producer. Verify C++ reflection APIs
   against `C:\Program Files\Epic Games\UE_5.7\Engine\Source`.
4. Upgrade fixture generation/verification to compare semantic values and metadata, including parent
   ordering and overrides, rather than only loadability and row names.
5. Add an authority-tagged `TableDescriptor` and a public catalog service. Saved discovery must use
   bounded concurrent classification with partial diagnostics; live discovery must list available
   DataTables. Merge authorities by canonical object path without hiding live/saved divergence.
6. Add CLI commands for saved/live table discovery and schema/snapshot export through the public
   service. Keep JSON output versioned and validate all external input.
7. Replace Workbench's environment-variable/file-picker-first route with a project-root table
   explorer. Keep the current table visible if replacement loading fails or the picker is cancelled.
8. Update package docs and the conformance ledger to distinguish implemented behavior from roadmap.

## Verification

- `pnpm fixture:generate`
- `pnpm fixture:verify`
- `pnpm exec vitest run packages/protocol/src packages/unreal-assets/src packages/unreal-connection/src`
- `pnpm ue-shed authoring tables fixtures/unreal-project`
- `pnpm --filter @ue-shed/workbench build`
- `pnpm check`

Add a named real-Unreal schema parity command if one does not exist. It must compare saved and live
descriptors for the fixture, while preserving explicit authority differences.

## STOP conditions

- A required Unreal property or metadata behavior has not been verified against UE 5.7 source.
- Saved parsing cannot establish a descriptor: return explicit partial/unsupported evidence; do not
  invent editability or defaults.
- v1 sessions cannot be migrated without changing meaning: preserve them read-only with recovery
  guidance instead of guessing.
- Catalog discovery requires a hard-coded project or engine path.
