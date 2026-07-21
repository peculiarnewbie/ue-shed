# Plan 006: Make Apply and Save safe, recoverable authority transitions

> **Executor instructions**: Do not expose mutation until all preflight, correlation, persistence,
> and real-Unreal tests in this plan pass. Update `plans/README.md` when done.
>
> **Drift check**: `git diff --stat 52df5c0..HEAD -- packages/authoring packages/protocol packages/unreal-connection unreal/Plugins/UEShedAuthoring fixtures apps/cli apps/workbench extensions/data-authoring package.json`

## Status

- **Priority**: P0
- **Effort**: L (multi-day)
- **Risk**: HIGH — this plan crosses the live Unreal mutation boundary
- **Depends on**: Plan 005
- **Planned at**: commit `52df5c0`, 2026-07-15
- **Status**: DONE — implemented and verified against Unreal Engine 5.7 on 2026-07-15

## Completion evidence

- Negotiated table, command, and payload limits are enforced before dispatch.
- Apply and Save requests are persisted before transport; unresolved Apply blocks editing and is
  reconciled by lookup after restart.
- Response IDs, exact table/package sets, and committed working-state fingerprints are correlated
  before commands can be cleared.
- The Unreal cache binds operation IDs to canonical request digests and rejects collisions.
- CLI and Workbench expose separate Apply, reconcile, and Save actions with Apply confirmation.
- `pnpm test:unreal-authoring` builds the UE 5.7 plugin and verifies all command shapes,
  multi-table commit/rollback, stale fingerprints, collisions, lookup recovery, partial/failed Save,
  and saved disk state. Fast tests cover response mismatch and durable restart transitions.

## Outcome

Draft → Applied → Saved is truthful, durable, bounded, and recoverable from process/editor/transport
failure. A stale draft is blocked with actionable drift evidence. An indeterminate operation is
reconciled before any new Apply. Apply and Save remain separate visible actions in library, CLI, and
Workbench.

## Safety work

1. Extend capability negotiation with maximum tables, commands, and encoded payload bytes. Preflight
   validates the working state and rejects oversized or unsupported plans before transport.
2. Correlate every response: Apply operation ID, Save request ID, exact affected table/package sets,
   returned snapshots, and fingerprints. Preserve commands on any mismatch.
3. Change the C++ operation cache from `operationId -> result` to `operationId -> canonical request
digest + result`. Return cached results only for the same request and reject ID collisions.
4. Persist a first-class pending/indeterminate Apply before dispatch. Block new Apply while it exists.
   Reconciliation must query operation lookup, compare current/returned fingerprints, and atomically
   rebase or restore the session; never retry mutation automatically.
5. Keep fingerprint mismatch as a blocked drift state in this plan. Do not silently rebase overlaps;
   Plan 007 adds three-way resolution.
6. Preserve transactional semantics across multiple tables and verify rollback after a late command
   failure. Successful Apply rebases commands and marks assets awaiting Save without claiming disk
   durability.
7. Save reports per-package status and retry safety. Persist partial results and allow retry only for
   the unresolved safe subset.
8. Wire CLI and UI pipeline states, receipts, capability/connection guidance, reconnect/reconcile,
   Apply confirmation, separate Save, and restart recovery through the session service.

## Required test gates

Add named commands such as `test:fast` and `test:unreal-authoring`; `pnpm check` may remain fast, but a
mutation-capable release must require the real gate and must report intentional skips clearly.

Real UE 5.7 coverage must include scalar edit, all five row commands, multi-table commit, multi-table
rollback, stale fingerprint, operation-ID collision, transport loss followed by lookup, editor exit,
response mismatch, Save success/partial/failure, and restart between each authority transition.

- `pnpm fixture:generate`
- `pnpm fixture:verify`
- `pnpm exec vitest run packages/authoring/src packages/unreal-connection/src`
- the new real-Unreal authoring command with `UE_SHED_UNREAL_INTEGRATION=1`
- `pnpm --filter @ue-shed/workbench build`
- `pnpm check`

## STOP conditions

- The real Unreal suite is skipped or cannot reset fixture state deterministically.
- An Apply can start while an earlier operation is indeterminate.
- The companion cannot prove an operation ID belongs to the same request.
- A mismatched response can clear commands or advance pipeline state.
- The UI combines Apply and Save into one ambiguous action.
