# Data authoring architecture grill

The fixture and engine characterization are complete enough to decide the public authoring model.
These decisions have multiple valid approaches and meaningful long-term consequences. They should be
resolved before `@ue-shed/authoring`, `UEShedAuthoring`, or CLI interfaces harden.

## 1. Read authority without a companion

### Decision

Plugin-free authoring is a first-class read-only mode backed by saved Unreal package inspection. It
does not depend on a running editor, Remote Control, or Editor Scripting Utilities. UE Shed owns
project and asset discovery, invokes the versioned `uasset` CLI JSON contract through a narrow
adapter, and normalizes supported assets for the authoring domain.

`UEShedAuthoring` provides a separate live-editor authority. It is required for unsaved editor state,
mutation, transactions, and Save, but not for useful discovery and inspection.

The product must name the authority of every snapshot:

- **project files:** read-only saved package state;
- **live editor:** current editor memory, which may include unsaved changes.

Neither authority is a degraded version of the other. They have different freshness and operation
capabilities. When both are available, drift between them is product state to expose, not an adapter
detail to hide.

## 2. Canonical snapshot and schema wire representation

### Decision

Define one normalized, language-neutral Unreal authoring contract for schemas, snapshots, and typed
values. Both the saved-package reader and `UEShedAuthoring` produce this same format. TypeScript
runtime schemas and types are derived from the contract rather than becoming a second authority.

The shared payload includes its project-files or live-editor authority, provenance, partial decoding,
and explicit unsupported values. Source-specific diagnostics may wrap the payload but must not alter
its authoring shape. Generic package metadata that has no authoring meaning remains outside the
shared contract.

This is not the stock DataTable JSON export format: that representation lacks sufficient schema,
metadata, and unsupported-value fidelity. Raw export may remain evidence, but it is not the product
contract.

## 3. Command granularity

### Decision

Drafts are an ordered log of five canonical command kinds: `SetCell`, `AddRow`, `RemoveRow`,
`RenameRow`, and `ReorderRows`. `SetCell` replaces one complete typed field value, including a struct
or container. Finer nested-value commands can be added only when real workflows justify their extra
conflict and inversion semantics.

Each command captures the prior value, row payload, index, name, or order needed to invert it without
consulting historical snapshots. Working state is folded from the active command prefix over the base
snapshot. Undo and redo move the prefix pointer; appending after undo truncates the redo tail.
Commands created by one user gesture share a group identity, append atomically, and form one undo
step even though the pointer still identifies an active command prefix.

Command envelopes record stable identity, authored-at time, author provenance, table identity, base
fingerprint, and dispatch state. Drafting does not imply that a command has been applied. Complete-row
or complete-table replacement is not a normal editing command because it obscures review and creates
unnecessarily broad conflicts.

## 4. Fingerprint authority

### Decision

The language-neutral authoring contract defines a versioned semantic fingerprint over canonical
table state. Saved-package and live-editor producers derive the same fingerprint for the same table
content. Authority, provenance, timestamps, diagnostics, and non-semantic package metadata are not
fingerprinted.

Producers return the fingerprint with a snapshot, and consumers may verify it. Immediately before
Apply, `UEShedAuthoring` recomputes the fingerprint from live editor state and compares it with the
expected base. File timestamps and dirty flags remain useful evidence but never substitute for
semantic comparison.

## 5. Transaction scope

### Decision

One bounded Apply plan may span several tables and executes inside one editor transaction. Every
command succeeds or the complete plan rolls back. Limits on commands, tables, and payload bytes are
part of capability negotiation so atomicity cannot imply unbounded work.

The first editing implementation may exercise one table, but neither the command model nor protocol
assumes one-table intent. Save remains a later, separate operation and reports each package result.

## 6. Persistent session authority

### Decision

Persist a versioned session atomically. It contains base snapshots, the ordered command log, undo
pointer, authoring-contract and fingerprint versions, authority provenance, Apply receipts, and the
set of assets still awaiting Save.

Successful Apply rebases active draft state from the returned live snapshots. It does not erase the
fact that changes were applied but remain unsaved. Apply and Save receipts make recovery and review
truthful after a restart without treating the renderer cache as authority.

## 7. Apply response under transport uncertainty

### Decision

Every Apply plan has a stable operation ID. The companion keeps a bounded result cache so reconnecting
clients can query the result without replaying mutation. If no result is available, the session
enters an indeterminate state and reconciles live fingerprints and snapshots before permitting
another Apply.

Automatic mutation replay is forbidden. The result distinguishes committed, rolled back, rejected,
and indeterminate outcomes and includes enough evidence to guide recovery.

## Reference behavior retained and improved

The behavioral reference validates the command-log core, but its incidental implementation is not
the target architecture.

### Retain

- canonical typed commands and thin draft intents;
- working state derived from a base snapshot plus active command prefix;
- pure inversion from data captured at draft time;
- permissive value drafting with structural impossibilities rejected immediately;
- undo, redo, grouped drafting, review, Apply, and Save as separate concepts;
- one session log shared by every UI and automation surface.

### Improve

- Use typed authoring values instead of unrestricted JSON payloads.
- Give rows session-stable identities so rename chains do not make every later command depend only on
  a mutable name.
- Treat an invalid fold as a typed session error; never silently skip a command that no longer fits.
- Record `authoredAt` when drafting and reserve Apply timestamps for Apply receipts.
- Give commands drafted by one user gesture a group identity for atomic append and coherent undo,
  without precommitting to a speculative history tree.
- Keep folding, persistence, validation, and dispatch authoritative in the headless domain service;
  renderers consume derived state rather than reproduce it.
- Preserve Apply and Save receipts instead of clearing the only evidence of the Draft to Applied to
  Saved pipeline.

## Decisions that can wait

- Custom authoring UI grants and isolation.
- Joined multi-table view configuration.
- Specialized field-editor registry shape.
- Source-control adapters around Save.
- Runtime extension loading.

These do not need to constrain the read-only spine or first single-table editing loop.
