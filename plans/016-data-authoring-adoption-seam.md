# Plan 016: Prove the Data Authoring adoption seam

> **Executor instructions**: Keep this plan demo-scoped. Do not generalize transports, migrate every
> Workbench feature, move Camera Lab, or resume Plan 007 while this work is in progress.
>
> **Drift check (run first)**: `git diff --stat 67a213e..HEAD -- apps packages extensions examples scripts docs package.json pnpm-workspace.yaml pnpm-lock.yaml`

## Status

- **Status**: DONE
- **Priority**: P0
- **Effort**: XL
- **Risk**: HIGH — this moves the flagship workflow's composition authority out of Workbench
- **Depends on**: Plans 004–006 and 014–015
- **Category**: architecture and adoption
- **Planned at**: commit `67a213e`, 2026-07-16
- **Completed**: 2026-07-16

## Why this matters

Workbench is still the only complete composition of Data Authoring. An adopter must reverse-engineer
Electron services and IPC even though the maintained route already depends on a host-neutral client
contract. The adoption demo must prove both sides of the intended boundary: a real non-Electron Node
host can run the authoring client directly, and a foreign Solid/Vite project can copy, render, and
restyle the maintained slice without importing Workbench.

The completed risk spike proved source StyleX is viable. It also found two concrete requirements:
Vite serve needs StyleX runtime injection while production builds extract CSS, and the browser-safe
authoring SDK must stop pulling Node session-service types into consumer typechecking.

## Commands you will need

| Purpose       | Command                                          | Expected on success               |
| ------------- | ------------------------------------------------ | --------------------------------- |
| SDK contract  | `pnpm --filter @ue-shed/authoring-sdk typecheck` | exit 0 without Node types         |
| Host tests    | `pnpm exec vitest run packages/host`             | direct client behavior passes     |
| Adoption gate | `pnpm test:adoption:data-authoring`              | fresh copied workspace builds     |
| Workbench E2E | `pnpm test:e2e:workbench`                        | existing authoring journey passes |
| Full gate     | `pnpm check`                                     | exit 0                            |

## Scope

**In scope**: browser-safe authoring contracts, `@ue-shed/host` authoring composition, direct
`AuthoringClientLive`, Workbench adaptation to that service, one headless non-Electron example, one
Data Authoring adoption manifest and agent guide, a fresh-workspace conformance test, and the
demo-facing integration documentation needed to find them.

**Out of scope**: generalized request/response transport, CLI re-adaptation, manifests for other
slices, Camera Lab relocation, complete Workbench host extraction, package publication, runtime
third-party extension loading, Plan 007, and new product slices.

## Steps

### Step 1: Make the SDK contract genuinely browser-safe

Relocate the schema-owned session review contracts so `@ue-shed/authoring-sdk` no longer imports the
Node-backed `@ue-shed/authoring` package. Preserve one authoritative schema and infer all public
types from it. Add a browser-consumer typecheck fixture with DOM libraries and no Node types.

**Verify**: the fixture imports every SDK contract and typechecks without `@types/node`.

### Step 2: Extract the authoring host service

Create the real `@ue-shed/host` package. Move the complete authoring orchestration currently owned by
`apps/workbench/src/main/services/authoring.ts` behind host-neutral configuration and file-picker
services. Preserve saved/live catalog behavior, bounded connection caching, session persistence,
Apply/Save reconciliation, typed failures, and named Effect operations.

Workbench must provide Electron configuration and dialog adapters to this public service. It must
not retain a second authoring implementation.

**Verify**: move the existing service tests to `packages/host` and keep saved, live, session,
failure, and cache behavior covered.

### Step 3: Add the direct client and slim host graph

Export `AuthoringClientLive`, backed directly by the extracted authoring service, plus a slim
`ShedHostLive` composition for AssetReader, RemoteControl, AuthoringCatalog, sessions, and the client.
Keep observability and process exits owned by the embedding runtime. Workbench IPC becomes an adapter
over the same `AuthoringClient` service.

**Verify**: a test acquires the direct client from the slim host graph and completes a configured
saved-table load and session begin without Electron or IPC.

### Step 4: Add the two minimal reference consumers

Add a small non-Electron Node example that uses `ShedHostLive` and `AuthoringClient` for a headless
authoring read/session journey. Add the foreign Solid/Vite slice fixture used by the adoption gate;
it uses a deterministic in-memory `AuthoringClientShape` because the generalized browser-to-Node
transport is deliberately deferred.

The Vite recipe must use `runtimeInjection: command === "serve"` and production CSS extraction.

**Verify**: the Node example runs against configured fixture input, and the browser example
typechecks and emits non-empty `stylex.css` in production.

### Step 5: Make adoption executable

Add a machine-readable Data Authoring manifest listing copied slice/UI files, kernel snapshot
closure, dependency/toolchain requirements, ownership, provenance instructions, and conformance
commands. Add a short agent guide that explicitly forbids copying Workbench and explains which
files the adopter owns versus tracks upstream.

Add a deterministic script that materializes a fresh temporary workspace from the manifest, installs
from the repository's dependency store, typechecks, builds, rejects Workbench imports, and confirms
the extracted CSS is non-empty. Keep generated state under ignored `test-results/`.

**Verify**: `pnpm test:adoption:data-authoring` passes from a clean checkout after the ordinary
workspace install.

### Step 6: Reconcile the showcase and documentation

Update the root and package documentation so integration outcomes lead and Workbench is presented as
the showcase ceiling. Record the successful fresh-agent artifact separately from the deterministic
gate; do not make a live agent run part of the room demo.

**Verify**: documentation links resolve and all copied commands are exercised by tests.

## Test plan

- Protocol/SDK decoder tests for the relocated review schemas.
- Browser-only TypeScript fixture proving no Node type leakage.
- Effect service tests for configuration, picker cancellation/failure, saved and live catalog loads,
  session persistence, Apply/Save, connection invalidation, and direct client delegation.
- Workbench IPC and E2E regression tests using the public direct service.
- Fresh-workspace adoption conformance covering install, typecheck, Vite build, non-empty StyleX CSS,
  and absence of Workbench/Electron imports.

## Done criteria

- [x] `@ue-shed/authoring-sdk` typechecks in a browser consumer without Node types.
- [x] `@ue-shed/host` owns Data Authoring composition and exports `AuthoringClientLive` plus the slim
      authoring host graph.
- [x] Workbench uses the public host service; no duplicate Workbench authoring implementation remains.
- [x] A non-Electron headless example exercises the direct client.
- [x] Data Authoring has a machine-readable manifest and per-slice agent guide.
- [x] A fresh copied Solid/Vite workspace builds with non-empty production StyleX CSS and no
      Workbench imports.
- [x] `pnpm check`, `pnpm test:adoption:data-authoring`, and `pnpm test:e2e:workbench` pass.

## STOP conditions

- Extracting authoring requires Electron, renderer, or IPC types in `packages/host`; introduce a
  smaller host-neutral port instead of moving the dependency.
- The browser example needs direct filesystem, process, or Unreal authority; stop and keep it on the
  client contract until the deferred transport bridge is designed.
- The manifest requires copying files outside its declared closure; fix the closure or contract
  boundary before documenting a workaround.
- Licensing approval becomes necessary for external distribution. This plan proves local/private
  adoption only and does not publish or grant rights.

## Maintenance note

Every future maintained slice should land with a browser-safe client contract, direct trusted-host
implementation, manifest, agent guide, and fresh-workspace conformance case. Generalize the transport
only after two real slices demonstrate the same repeated adapter shape.
