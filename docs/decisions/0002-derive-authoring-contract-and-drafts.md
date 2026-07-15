# 0002: Derive authoring producers and drafts from shared contracts

- **Status:** Accepted
- **Date:** 2026-07-14

## Context

Read-only authoring can inspect saved Unreal packages without an editor. Live authoring can inspect
unsaved editor memory and mutate it through a separately enabled companion. If these sources define
independent table models, every domain feature must translate and reconcile both representations.

Draft editing also needs a durable model that supports review, undo, conflicts, transactional Apply,
and separate Save without making a renderer authoritative.

## Decision

Define one language-neutral authoring contract for schemas, authority-tagged snapshots, typed values,
unsupported values, and semantic fingerprints. The saved-package reader and Unreal companion derive
their authoring output from that contract. TypeScript runtime schemas and types derive from it as
well.

Drafts are a persistent ordered log of five typed command kinds: Set Cell, Add Row, Remove Row, Rename
Row, and Reorder Rows. Commands capture enough prior data for pure inversion. Working state is folded
from the active command prefix over recorded base snapshots. The headless authoring service owns
folding, validation, persistence, Apply, and Save state.

Apply accepts a bounded, potentially multi-table plan under one editor transaction. Semantic
fingerprints protect the base. Stable operation IDs and result lookup handle transport uncertainty
without automatic mutation replay. Apply and Save create separate durable receipts.

## Consequences

- Project-files and live-editor modes have equal authoring shapes but distinct authority and
  capabilities.
- Parser-specific package evidence and companion transport details remain outside the authoring
  payload.
- Structured fields and containers begin as complete typed cell values; nested commands require
  demonstrated need.
- Session files require explicit contract, fingerprint, and persistence versions plus atomic writes.
- Invalid folds, partial decoding, drift, and indeterminate Apply outcomes are typed states, not
  silent fallbacks.
- Renderers and trusted host clients draft through the same public service and receive no Apply or
  Save authority implicitly.
