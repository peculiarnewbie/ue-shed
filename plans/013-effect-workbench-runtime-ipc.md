# Plan 013: Make Workbench main and IPC one scoped Effect runtime

> **Executor instructions**: Follow this plan in order. Do not combine checkpoints merely because
> several touch the same old file. Run each checkpoint's verification command and confirm the
> expected result before continuing. Preserve every preload method, IPC channel name, encoded result
> shape, renderer-visible failure, and exit behavior unless this plan explicitly says otherwise. If
> a STOP condition occurs, stop and report; do not add a Workbench-only domain implementation to get
> around it. Update `plans/README.md` only after all unit, component, Electron E2E, architecture, and
> full-repository gates pass.
>
> **Drift check (run first)**:
> `git diff --stat c618729..HEAD -- apps/workbench/src/main apps/workbench/src/renderer/global.d.ts apps/workbench/e2e apps/workbench/package.json apps/workbench/tsup.config.ts packages scripts/check-effect-architecture.mjs scripts/check-effect-architecture.test.mjs`
>
> If any in-scope file changed, compare the inventories and excerpts below with the live code before
> editing. Update line references locally, but do not silently reinterpret changed behavior. A new
> IPC channel, new global resource, changed public service API, or changed Electron lifecycle is a
> STOP condition until the plan is reconciled.

## Status

- **Priority**: P0
- **Effort**: XL — execute as ten reviewable checkpoints (Steps 0-9)
- **Risk**: HIGH — Electron lifecycle, IPC, child processes, named-pipe ownership, camera
  presentation, and live mutation recovery meet here
- **Depends on**: Plan 011; Plan 012 is the process-runtime exemplar
- **Category**: migration
- **Planned at**: commit `c618729`, 2026-07-16

## Why this matters

`apps/workbench/src/main/main.ts` is currently a 1,172-line application, composition root, Electron
adapter, cache, process supervisor, camera scheduler, and IPC router. It contains 21
`Effect.runPromise` calls, repeated Promise/Effect crossings, direct environment reads, raw fetches,
and module-global resource state. This prevents truthful cancellation and teardown, makes optional
capabilities difficult to model, and lets Workbench duplicate orchestration that now exists in public
domain services.

The desired result is one `ManagedRuntime` whose scope owns every Workbench resource. Electron IPC is
the one Promise adapter around that runtime. Workbench may own host concerns—dialogs, windows,
presentation state, fixture-process launch, and renderer projections—but it must not own generic
authoring, catalog, camera, audit, text, or review behavior. Deleting `apps/workbench` must still leave
those capabilities available through packages and the CLI.

## Non-negotiable product constraints

The executor must preserve these decisions:

- `docs/vision-and-architecture.md`: opening Workbench does not launch Unreal. Saved-package
  operations remain useful while all live capabilities are absent.
- `docs/decisions/0001-authoring-first-proving-slice.md`: authoring packages and the CLI work without
  Workbench.
- `docs/decisions/0002-derive-authoring-contract-and-drafts.md`: the headless authoring service owns
  folding, validation, persistence, Apply, and Save state; renderers and hosts do not.
- `docs/decisions/0003-demand-driven-local-camera-frames.md`: `@ue-shed/cameras` owns transport
  decoding and host metrics. Workbench owns only bounded presentation state and renderer timing.
- `docs/engineering/effect.md`: resources are scoped; expected failures remain typed; Promise APIs
  are adapted once; `Effect.run*` is restricted to foreign-framework/runtime adapters.
- Plan 014 owns renderer clients and Solid state. This plan preserves the current preload API and
  `window.ueShed` contract rather than migrating renderer clients to Effect.
- Plan 015 removes the remaining migration allowlists. This plan must lower the main-process
  baselines it eliminates so regressions cannot return before Plan 015.

## Current state

### Main-process hotspot

At `c618729`, `apps/workbench/src/main/main.ts` has 1,172 lines and directly imports Electron,
Node child processes/files, every domain package, Effect runtime primitives, and renderer-facing
contract types.

`apps/workbench/src/main/main.ts:76-94` establishes three local runtime exits and eleven global
runtime values:

```ts
const remoteControlEndpoint =
	process.env.UE_SHED_REMOTE_CONTROL_ENDPOINT ?? "http://127.0.0.1:30001";
const runRemoteControl = <A, E>(effect: Effect.Effect<A, E, RemoteControlClient>) =>
	Effect.runPromise(effect.pipe(Effect.provide(RemoteControlClientLive)));
const runAssetReader = <A, E>(effect: Effect.Effect<A, E, AssetReader>) =>
	Effect.runPromise(effect.pipe(Effect.provide(AssetReaderLive)));
const runReviewRepository = <A, E>(effect: Effect.Effect<A, E, ReviewRepository>) =>
	Effect.runPromise(effect.pipe(Effect.provide(ReviewRepositoryLive)));
let feed: CameraFeedShape | undefined;
let cameraFeedScope: Scope.Closeable | undefined;
let window: BrowserWindowInstance | undefined;
const pendingPresentationFrames = new Map<number, CameraFrame>();
let presentationTimer: NodeJS.Timeout | undefined;
// counters, budget, launch promises follow
```

`apps/workbench/src/main/main.ts:390-405` stores catalog, snapshot, live connection, and session
authority in globals and constructs the session service through a Promise:

```ts
const authoringAssetPaths = new Map<string, string>();
const authoringSnapshots = new Map<string, AuthoringTableSnapshot>();
const authoringLiveObjectPaths = new Set<string>();
let authoringLiveConnection: UnrealAuthoringConnection | undefined;
const acquireSessionService = (projectRoot: string) =>
	Effect.runPromise(makeAuthoringSessionService({ projectRoot }));
let authoringSessions: ReturnType<typeof acquireSessionService> | undefined;
```

`apps/workbench/src/main/main.ts:724-805` manually deduplicates fixture launches, constructs a
`CameraFeed` scope, creates the window, forks the frame stream, and mutates presentation globals.

`apps/workbench/src/main/main.ts:1143-1172` registers the last domain handlers, starts through
`app.whenReady().then(...)`, and performs best-effort camera-scope cleanup from `before-quit`.

### External boundaries and mutable ownership

Replace each current value with the listed owner. Do not merely move a global into another file.

- `window` (lines 86 and 776-815) → scoped `WorkbenchWindow` Electron adapter.
- `feed` and `cameraFeedScope` (lines 84-85 and 777-805) → `CameraFeed` in
  `WorkbenchLive`'s runtime scope.
- Presentation map, timer, counters, budget, and deadline (lines 87-92 and 749-774) →
  `CameraPresentation` service with a private `Ref`, bounded wake queue, and scoped worker.
- `fixtureLaunch` and `fixtureReviewLaunch` (lines 93-94 and 724-736) → one layer-owned `Cache`
  keyed by launch mode, with zero TTL after completion for in-flight deduplication only.
- Authoring asset, snapshot, and live-path maps (lines 390-392) → immutable catalog/snapshot state
  in private `WorkbenchAuthoring` `Ref`s.
- `authoringLiveConnection` (lines 393, 528, and 1048) → layer-owned `Cache` or scoped resolver;
  transient failures are not cached.
- `authoringSessions` Promise (lines 394-403) → session context acquired once in the owning layer
  when project configuration exists.
- Direct environment reads (lines 76, 99-105, 399, 631, 667, 739-740, 861, 877-878, 921, 936,
  941, and 966) → `WorkbenchConfiguration` built from Effect `Config` recipes.
- Raw `fetch` health probes (lines 605-649) → `FixtureHealth` using `RemoteControlClient` and
  decoded manifest results.
- Child-process Promise and polling loop (lines 656-718) → scoped `FixtureLauncher` using a Node
  process adapter and `Schedule`/Effect timing.
- Direct `ipcMain.handle` registrations (lines 724-1155) → feature registration modules through one
  `ElectronIpc` adapter.

### IPC compatibility inventory

There are 28 request/response channels plus one main-to-renderer event. These names and preload
methods are compatibility constraints for this plan.

- Fixture: `fixture:launch` and `fixture:launch-review`; no input; local
  `FixtureLaunchResult` output schema.
- Showcase: `showcase:context`; no input; local `ShowcaseContext` output schema.
- Asset audits: `asset-audits:textures:configured-scan`,
  `asset-audits:textures:choose-and-scan`, and `asset-audits:textures:preview`; no input or a
  validated `/Game/` object path; `TextureAuditRunResult` or `TexturePreviewResult` output.
- Game text: `game-text:configured-scan` and `game-text:choose-and-scan`; no input;
  `TextCorpusRunResult` output.
- Authoring load/catalog: `authoring:configured-table`, `authoring:configured-catalog`,
  `authoring:open-catalog-table`, and `authoring:choose-table`; no input or an object path;
  `AuthoringLoadResult` or `AuthoringCatalogResult` output.
- Authoring sessions: `authoring:session:begin`, `authoring:session:edit`,
  `authoring:session:undo`, `authoring:session:redo`, `authoring:session:apply`,
  `authoring:session:reconcile`, and `authoring:session:save`; object path,
  `AuthoringSetCellsIntent`, or session ID input; `AuthoringSessionResult` output.
- Camera control: `camera:metrics`, `camera:presentation-budget`, `camera:status`, and
  `camera:configure`; no input, a bounded budget, or `CameraScheduleConfig` input; local metrics,
  bounded-number, or `CameraStatus` output schema.
- Map review: `map-review:load`, `map-review:capture`, `map-review:author-from-selection`,
  `map-review:preview-candidate`, and `map-review:approve-candidate`; no input, candidate ID, or
  `MapReviewApproveCandidateIntent`; output schemas from `packages/cameras/src/review-ipc.ts`.
- Camera frame event: `camera:frame`; main-owned event; local `RendererCameraFrame` schema whose
  sequence remains a decimal string.

Schema authorities already exist for most payloads:

- `packages/asset-audits/src/schema.ts`
- `packages/game-text/src/schema.ts`
- `packages/authoring-sdk/src/index.ts`
- `packages/protocol/src/cameras.ts`
- `packages/cameras/src/review-ipc.ts`

Do not restate those shapes in Workbench. Workbench-local schemas are appropriate only for
`ShowcaseContext`, `FixtureLaunchResult`, `WorkbenchCameraMetrics`, `RendererCameraFrame`, bounded
presentation budget, object path, session ID, candidate ID, and no-input tuples.

### Public services that must replace compatibility accessors

The following Plan 011 services exist and are the permitted domain dependencies:

- `TextureAudit` / `TextureAuditLive`
- `TextCorpusService` / `TextCorpusServiceLive`
- `AuthoringCatalog` / `AuthoringCatalogLive`
- `AuthoringSessions` / `authoringSessionServiceLayer(...)`
- `ReviewCapture` / `ReviewCaptureLive`
- `ReviewAuthoring` / `ReviewAuthoringLive`
- `ReviewRepository` / `ReviewRepositoryLive`
- `AssetReader` / `AssetReaderLive`
- `RemoteControlClient` / `RemoteControlClientLive`
- `CameraFeed` / `cameraFeedLayer(...)`

`getCameraStatus` and `configureCameras` are already public Effect workflows requiring
`RemoteControlClient`; they need not be wrapped in a fake domain service. Workbench may define
application services that combine these public operations with host configuration and renderer
projections. It must not use the temporary compatibility functions that construct their own layers.

### Existing test and architecture enforcement

- `apps/workbench/e2e/fixtures/workbench-test.ts` launches the production Electron build and always
  closes it in `finally`.
- `apps/workbench/e2e/workbench.smoke.e2e.ts` proves saved Data Authoring and Map Review load without
  launching Unreal.
- `apps/workbench/e2e/map-review-authoring.e2e.ts` is the environment-gated real-editor path.
- `apps/cli/src/application.test.ts` is the closest small example of testing one acquire/one release
  with `Layer.effect` and `Effect.acquireRelease`.
- `scripts/check-effect-architecture.mjs` currently allows 21 `Effect.runPromise`, one
  `Effect.runSync`, 32 `Promise<`, 16 `process.env`, and two raw `fetch` occurrences in
  `apps/workbench/src/main/main.ts`. These allowances must be lowered as this plan removes them.

## Target module map

Use these ownership boundaries. Minor filename adjustments are acceptable only when ownership stays
equally explicit; do not replace this map with a single `workbench-service.ts` god object.

```text
apps/workbench/src/main/
  main.ts                         # Electron bootstrap only; no domain imports
  preload.ts                      # existing renderer API; channel names unchanged
  ipc-contracts.ts                # local schemas + channel contract table
  workbench-config.ts             # Config recipes and WorkbenchConfiguration service
  workbench-live.ts               # named, topologically sorted Layer graph
  workbench-program.ts            # create window/register IPC/start scoped workers
  adapters/
    electron-app.ts               # app lifecycle/metrics/quit boundary
    electron-window.ts            # BrowserWindow creation, load, show, send, destroy
    electron-dialog.ts            # open file/directory dialogs with typed cancellation
    electron-ipc.ts               # the only IPC Promise/runtime adapter; unregister finalizers
    fixture-process.ts            # cancellable child process boundary
    local-files.ts                # host-only preview/artifact reads and existence checks
  services/
    fixture-launcher.ts           # health, demand launch, Cache dedupe, polling Schedule
    showcase.ts                   # configured readiness projection
    asset-audits.ts               # TextureAudit + dialog/config adaptation
    game-text.ts                  # TextCorpusService + dialog/config adaptation
    authoring.ts                  # host state/projection over catalog and session services
    map-review.ts                 # host projection over review services/repository
    camera-presentation.ts        # bounded latest-frame-wins renderer delivery
  ipc/
    register.ts                   # composes feature registration effects
    fixture.ts
    showcase.ts
    asset-audits.ts
    game-text.ts
    authoring.ts
    cameras.ts
    map-review.ts
```

Every adapter and application service must expose a `Context.Service`, a real layer, and a small test
layer or constructor. Public and non-trivial methods use `Effect.fn("Workbench.<area>.<operation>")`.
Expected adapter failures use `Schema.TaggedErrorClass` with operation, safe context, retry guidance,
and preserved cause text.

## Commands you will need

- Drift: run the command in the executor block; expect an empty diff or a reviewed reconciliation.
- Main tests: `node scripts/test.mjs apps/workbench/src/main`; expect all main-process Effect tests
  to pass.
- Workbench typecheck: `pnpm --filter @ue-shed/workbench typecheck`; expect exit 0.
- Architecture: `pnpm effect:architecture`; expect exit 0.
- Architecture tests: `pnpm test:architecture`; expect all tests to pass.
- Component tests: `pnpm test:components`; expect all tests to pass.
- Workbench E2E iteration: `pnpm test:e2e:workbench --no-build`; expect all non-gated specs to pass
  against an existing build.
- Workbench E2E final: `pnpm test:e2e:workbench`; expect a production build and all non-gated specs
  to pass.
- Fast repository tests: `pnpm test:fast`; expect all portable tests to pass.
- Full repository gate: `pnpm check`; expect exit 0.
- Real mutation gate, only when Apply/Save integration behavior changes:
  `pnpm test:unreal-authoring`; expect the real fixture mutation suite to pass.

## Suggested executor toolkit

- Use the `effect` skill if available. Read its services/layers, schema, config, caching, streams, and
  testing references before implementation.
- Verify v4 APIs against the installed `effect@4.0.0-beta.98` source. In particular,
  `ManagedRuntime.make(layer)` lazily builds/caches the context and owns a scope; call `dispose()` or
  `disposeEffect` exactly once.
- Use `@effect/vitest` for new main-process tests and declare it in
  `apps/workbench/package.json` through `catalog:`.
- Use the existing Playwright Workbench fixture/page objects; do not introduce a second Electron
  harness.

## Scope

**In scope**:

- `apps/workbench/src/main/**`
- `apps/workbench/e2e/**`
- `apps/workbench/package.json`
- `apps/workbench/tsup.config.ts` only if new main entries require it
- `scripts/check-effect-architecture.mjs`
- `scripts/check-effect-architecture.test.mjs`
- `plans/README.md` after all gates pass
- a package file under `packages/` only if a listed public service has a concrete composition defect
  that prevents layer use; this requires satisfying the preflight STOP rule below before editing it

**Out of scope**:

- Renderer client migrations, Solid state, or changing `window.ueShed` Promise signatures (Plan 014)
- IPC channel renames, preload method renames, or renderer-visible result-shape changes
- New product behavior or commands
- Automatic Unreal launch during runtime/window acquisition
- Wire contract or Unreal plugin changes
- A generic desktop-host framework or runtime extension system
- Camera transport/decoder refactors inside `@ue-shed/cameras`
- Hot-path exceptions without a measured before/after benchmark and a separate architecture-decision
  update; if one appears necessary, STOP

## Git workflow

- Start from `c618729` or a descendant after passing the drift check.
- Use a dedicated topic branch if the operator has not already selected a workflow.
- Make one commit per checkpoint or closely related pair. Repository messages are imperative and
  concise; examples are `complete Effect domain service migration` and
  `feat: complete Effect infrastructure services`.
- Do not push or open a pull request unless the operator explicitly requests it.
- Preserve unrelated user changes. Before every commit, inspect `git status --short` and
  `git diff --check`.

## Execution checkpoints

### Step 0: Re-run the boundary audit and prove prerequisites

Before adding adapters, confirm the live code still matches the inventories above.

1. Count IPC channels and compare them with the 28-row feature inventory.
2. Count `Effect.runPromise`, `Effect.runSync`, `Promise<`, `process.env`, raw `fetch`, module-level
   mutable `Map`/`Set`, timers, connections, services, and windows in `src/main`.
3. Map every existing handler to one listed public service or one explicitly host-owned service:
   dialog, local file projection, fixture launch/health, Electron metrics, or camera presentation.
4. Confirm Apply, reconcile, Save, catalog merge, review capture, review authoring, texture audit,
   game-text scan, saved-table read, and camera control are available as public Effect workflows.
5. Run the current production Workbench E2E once and retain failure artifacts if the baseline is not
   green.

**STOP** if a generic workflow required by a current channel exists only in `main.ts`, or if using it
requires a package to depend on Workbench. Report the missing operation and propose a prerequisite
domain-service plan; do not recreate it as a Workbench service.

**Verify**:

```powershell
rg -n "ipcMain\.handle|Effect\.run(Promise|Sync)|process\.env|fetch\(|^let |new Map|new Set" apps/workbench/src/main
pnpm --filter @ue-shed/workbench typecheck
pnpm test:e2e:workbench
```

Expected: the inventory is reconciled, typecheck exits 0, and all non-gated E2E specs pass before the
migration begins.

### Step 1: Freeze IPC contracts and add characterization tests

Create `ipc-contracts.ts` before moving handlers.

1. Define a contract record for all 28 invoke channels and the `camera:frame` event. Each invoke
   contract owns an argument tuple schema and a result schema.
2. Reuse package schemas directly. Do not duplicate `AuthoringSetCellsIntent`,
   `CameraScheduleConfig`, map-review contracts, audit results, or text results.
3. Define Workbench-local schemas for the remaining preload-owned types and infer their TypeScript
   types from the schemas. Replace handwritten interfaces in `preload.ts` with type-only imports from
   the contract module while preserving its emitted API.
4. Model `/Game/` object paths, non-empty session/candidate IDs, and presentation budgets with
   constrained schemas. The presentation budget must retain the current normalized range of 25–500
   MB/s; decide explicitly whether out-of-range finite values clamp or fail based on the current
   behavior, then characterize it.
5. Add contract tests covering every channel name, valid input, malformed input, no-input channels
   receiving unexpected values, and output validation. Assert typed decode failures rather than
   thrown JSON/type errors.
6. Add a parity assertion that the contract-table channel set exactly equals the channels exposed in
   `preload.ts`; a new preload method must fail this test until its main contract exists.

Do not register handlers yet.

**Verify**:

```powershell
node scripts/test.mjs apps/workbench/src/main/ipc-contracts.test.ts
pnpm --filter @ue-shed/workbench typecheck
```

Expected: all contract cases pass and preload continues to typecheck with unchanged method names and
Promise return types.

### Step 2: Build narrow Electron and Node adapter services

Create adapter services without moving domain workflows into them.

1. `ElectronApp` wraps readiness, process metrics, quit requests, and lifecycle event registration.
   Listener registration uses acquire/release and removes listeners on finalization.
2. `WorkbenchWindow` owns exactly one `BrowserWindow`. Acquire it with the current dimensions,
   security options, preload path, title, hidden-first behavior, and `ready-to-show` handling. Its
   finalizer removes listeners and destroys the window if still alive. Expose domain-neutral
   `load`, `show`, `send`, `isDestroyed`, and identity operations only.
3. `ElectronDialog` exposes typed `chooseDirectory` and `chooseFile` operations returning a
   discriminated `selected | cancelled` value. It obtains the parent window from
   `WorkbenchWindow`; eliminate non-null assertions such as `window!`.
4. `ElectronIpc` registers a channel contract plus an Effect handler. It must:
    - decode the entire unknown argument tuple before calling the handler;
    - validate the returned value against the channel's result schema;
    - adapt the handler to the Promise Electron requires in one shared function;
    - preserve interruption/defects rather than converting them into arbitrary success values;
    - call `ipcMain.removeHandler(channel)` in its finalizer;
    - reject duplicate registration in tests.
5. `FixtureProcess` adapts `spawn` once. Capture at most the existing 16 KiB stderr tail, preserve
   exit code/error detail, hide the window, and terminate an in-flight launcher child when the
   owning scope closes. Do not kill an Unreal process launched by the script; only own the launcher
   child created by this adapter.
6. `LocalFiles` wraps `exists` and bounded file reads used by showcase and review projections. Do not
   expose arbitrary filesystem access to IPC modules.
7. Provide real layers and first-class test layers. Tests use fake adapters, `Deferred`, and `Ref`,
   not Electron itself where a fake can truthfully prove registration and cleanup.

Only files under `adapters/` may import `electron/main`; `preload.ts` remains the only file importing
renderer-side Electron APIs.

**Verify**:

```powershell
node scripts/test.mjs apps/workbench/src/main/adapters
rg -n 'from "electron/main"' apps/workbench/src/main
pnpm --filter @ue-shed/workbench typecheck
```

Expected: adapter tests pass; `electron/main` matches only adapter files and the minimal bootstrap if
strictly required; typecheck exits 0.

### Step 3: Centralize startup configuration without making optional features mandatory

Create `WorkbenchConfiguration` and its layer from Effect `Config` recipes.

1. Decode these current variables once: `UE_SHED_REMOTE_CONTROL_ENDPOINT`,
   `UE_SHED_PROJECT_ROOT`, `UE_SHED_REVIEW_SET`, `UE_SHED_PROJECT_NAME`,
   `UE_SHED_REPOSITORY_ROOT`, `UE_SHED_TEXTURE_AUDIT_RULES`, and
   `UE_SHED_AUTHORING_ASSET`.
2. Preserve the Remote Control default `http://127.0.0.1:30001`.
3. Represent project, review, audit, authoring-asset, and source-checkout launch configuration as
   discriminated configured/not-configured values. Do not use a bag of unrelated optional strings
   that permits impossible combinations.
4. Derive the default Review Set path only when a project root exists. An absent project root must
   not fail startup.
5. Keep `AssetReaderLive` responsible for its own `UE_SHED_UASSET_*` config. Do not duplicate that
   adapter configuration in Workbench.
6. Test complete config, every optional capability absent, derived Review Set path, explicit Review
   Set override, default endpoint, and malformed configured values using
   `ConfigProvider.fromUnknown`; do not mutate `process.env` in unit tests.
7. Replace every direct environment read in new modules. The old reads may remain in old `main.ts`
   until their handler group is cut over, but no new direct read is allowed.

**Verify**:

```powershell
node scripts/test.mjs apps/workbench/src/main/workbench-config.test.ts
rg -n "process\.env" apps/workbench/src/main --glob '!main.ts'
pnpm --filter @ue-shed/workbench typecheck
```

Expected: config tests pass, the grep returns no matches outside the not-yet-deleted legacy main,
and typecheck exits 0.

### Step 4: Implement host application services over public domain services

Create feature services under `services/`. Their methods return existing schema-owned renderer
results. They do not know IPC channel names and do not call `Effect.run*` or construct layers.

#### 4A. Showcase, audits, and game text

- `Showcase` combines configuration, `AssetReader.source`, and `LocalFiles.exists` into the existing
  readiness projection.
- `WorkbenchAssetAudits` yields `TextureAudit` for scans and the public live-preview workflow for
  preview. Dialog selection remains host behavior.
- `WorkbenchGameText` yields `TextCorpusService` for scans. Preserve configured, cancelled,
  completed, and typed failed variants.
- Translate domain errors once at the application-service boundary; do not inspect renderer error
  text to decide behavior.

#### 4B. Authoring

- `WorkbenchAuthoring` yields `AssetReader`, `AuthoringCatalog`, and `AuthoringSessions` (when
  configured) rather than calling compatibility accessors.
- Acquire the configured session service once in the owning layer. If project config is absent,
  store an explicit not-configured capability and return current `not_configured`/typed failure
  results; do not fail `WorkbenchLive` acquisition.
- Replace asset path, snapshot, and live-authority globals with immutable values in private `Ref`s.
  A catalog refresh atomically replaces the entire index. Do not clear and repopulate shared mutable
  maps across yields.
- Use a layer-owned `Cache` for endpoint connection/manifest acquisition. Concurrent requests for
  the same endpoint share one lookup; transient failure TTL is zero; successful entries are bounded
  and explicitly invalidated after a connection-class failure or refresh policy that requires new
  capability negotiation.
- `begin`, `edit`, `undo`, `redo`, `apply`, `reconcile`, and `save` call the corresponding
  `AuthoringSessions` operation. Apply/Save indeterminate handling stays in the domain service.
- Keep `sessionView` as a pure host projection, move it beside the service, and exhaustively handle
  every pending-operation/pipeline variant.
- Preserve saved-first operation when Unreal is absent and live-first table reads when the refreshed
  catalog proves live authority.

#### 4C. Map Review

- `WorkbenchMapReview` yields `ReviewRepository`, `ReviewCapture`, and `ReviewAuthoring`.
- Keep artifact-byte loading and `MapReviewRunView` construction as a bounded host projection using
  `LocalFiles`; use `Effect.forEach` with an explicit small concurrency rather than `Promise.all`.
- Capture calls `ReviewCapture.captureSet` once, then reloads the view. Do not reimplement staging,
  promotion, or finalization.
- Selection inspection and candidate preview call `ReviewAuthoring` methods. Approval may compose
  the public pure `approveFramingCandidate` transformation with `ReviewRepository.saveSet`, but must
  preserve actor/pose freshness checks and return schema-owned failures.
- Missing Review configuration returns `not_configured` or the existing typed authoring failure;
  it does not fail application startup.

Add Effect tests for each service using package test layers and real temp directories where local
file behavior matters. Cover success, not configured, cancellation, typed domain failure, malformed
stored data, connection absence, connection-cache dedupe, cache failure non-retention, and session
indeterminate outcomes. Do not mock pure domain transformations.

**Verify**:

```powershell
node scripts/test.mjs apps/workbench/src/main/services
rg -n "Effect\.run(Promise|Sync)|async function|Promise\.all|makeAuthoringSessionService|captureReviewSet|scanTextureAudit|scanTextCorpus|discoverAuthoringProjectCatalog" apps/workbench/src/main/services
pnpm --filter @ue-shed/workbench typecheck
```

Expected: service tests pass; grep has no runtime exits, Promise orchestration, service constructors,
or listed compatibility accessor calls; typecheck exits 0.

### Step 5: Make fixture launch demand-driven, cancellable, and deduplicated

Implement `FixtureHealth` and `FixtureLauncher` as services.

1. Health uses `RemoteControlClient` to call and decode the capability manifest. Preserve the
   optional expected-project match. The Map Review mode also probes the review capture capability
   without performing a real capture.
2. Model launch mode as `default | authoring`; do not maintain two Promise globals.
3. Build one `Cache` in the layer with capacity 2, keyed by launch mode. Its lookup owns the complete
   check/launch/wait workflow. Use exit-aware TTL so concurrent calls share in-flight work but a
   completed result is immediately eligible for a future health check. Do not cache transient
   failure as permanent state.
4. If the required capability is already healthy, return `ready` without spawning.
5. If an incompatible Unreal instance occupies the endpoint, preserve the current explicit failure
   and recovery message.
6. If source-checkout launcher config is absent, return the existing failure without spawning.
7. Launch through `FixtureProcess`, then poll through `Schedule` at one-second spacing with a bounded
   three-minute deadline. Use Effect clock/scheduling; no manual `Date.now` loop or Promise sleep.
8. Interruption or runtime disposal interrupts polling and closes an in-flight launcher child.
9. Layer acquisition and Workbench window creation must never call `launch` or health polling.

Tests use `TestClock`, `Deferred`, and a fake process service. Prove: already healthy, incompatible
capability, missing source checkout, successful launch then readiness, timeout, concurrent dedupe,
retry after failure, cancellation cleanup, and zero process calls during layer acquisition.

**Verify**:

```powershell
node scripts/test.mjs apps/workbench/src/main/services/fixture-launcher.test.ts
rg -n "new Promise|Date\.now|setTimeout|fixtureLaunch|fixtureReviewLaunch|fetch\(" apps/workbench/src/main/services/fixture-launcher.ts apps/workbench/src/main/adapters/fixture-process.ts
```

Expected: tests pass; no manual polling/dedupe Promise remains. A Promise may appear only inside the
single Node child-process adapter if required by the foreign callback API.

### Step 6: Replace camera presentation globals with one scoped service

Implement `CameraPresentation` separately from transport decoding.

1. Depend on `CameraFeed`, `WorkbenchWindow`, Effect `Clock`, and private state primitives.
2. Consume `CameraFeed.frames` in a worker forked with `Effect.forkScoped` during layer acquisition.
   Acquisition must complete immediately after the worker is forked.
3. Keep one latest pending frame per camera. Use immutable `HashMap` in a `Ref` or an equivalently
   bounded keyed structure. The maximum supported public camera index remains 0–31; reject or count
   invalid frames rather than allowing unbounded keys.
4. Use a capacity-one sliding wake queue (or an equivalent bounded signal) so producers never create
   one timer/fiber per frame. The worker drains one pending frame at a time, calculates the aggregate
   byte-budget delay with Effect clock, sleeps interruptibly, sends, updates metrics, and continues.
5. Preserve zero-copy pixel views across the main-process presentation queue. Convert only the
   `bigint` sequence to its decimal string at the IPC event boundary.
6. Keep the current latest-frame replacement metric, frames-sent metric, 80 MB/s default, and
   25–500 MB/s configured range.
7. Merge transport metrics from `CameraFeed.metrics` with Electron process metrics and presentation
   metrics in one typed operation.
8. On window close/runtime disposal, interrupt both workers, clear pending references, and guarantee
   no later `webContents.send` call.
9. Do not modify `packages/cameras/src/index.ts` or claim a hot-path exemption. If an implementation
   cannot meet the current 32-camera E2E behavior without direct mutable/timer code, stop and produce
   a before/after benchmark plus an ADR-update proposal.

Tests use `makeCameraFeedTestLayer`, a queue-driven frame stream, `TestClock`, and a recording window
service. Cover per-camera replacement, aggregate pacing, budget changes, fairness across camera
indices, invalid indices, slow window delivery, window destruction, interruption, finalization, and
no post-close sends.

**Verify**:

```powershell
node scripts/test.mjs apps/workbench/src/main/services/camera-presentation.test.ts
rg -n "setTimeout|clearTimeout|NodeJS\.Timeout|new Map|presentationTimer|pendingPresentationFrames" apps/workbench/src/main/services/camera-presentation.ts
```

Expected: deterministic tests pass; no manual timer or mutable global presentation structure exists.

### Step 7: Compose one topologically sorted `WorkbenchLive` graph

Create named layer subgraphs in `workbench-live.ts`; do not scatter `Effect.provide(...)` throughout
handlers.

Recommended topology:

```text
ConfigProvider/default runtime services
  -> WorkbenchConfiguration
  -> ElectronApp + WorkbenchWindow + ElectronDialog + ElectronIpc
  -> AssetReader + RemoteControlClient + repositories + CameraFeed
  -> TextureAudit + TextCorpus + AuthoringCatalog + optional configured AuthoringSessions
  -> ReviewAuthoring + ReviewCapture
  -> FixtureLauncher + feature application services + CameraPresentation
  -> IPC registration + WorkbenchProgram
```

1. Use `Layer.provide` to hide implementation dependencies and `Layer.mergeAll` only for genuinely
   independent exposed siblings. Give each subgraph a descriptive constant.
2. Build caches, refs, workers, listeners, window, and CameraFeed once in their owning layers.
3. Optional project/review/audit/authoring/launcher config must produce usable not-configured feature
   services. It must not make `WorkbenchLive` fail.
4. Malformed explicitly supplied config, inability to create the BrowserWindow, inability to bind
   the camera pipe, or IPC registration defects may fail startup with typed errors.
5. Define `WorkbenchProgram.start` as the effect that ensures the window has loaded, registers all
   handlers, starts scoped workers, and shows the window at the same visible readiness point as
   today. It must not launch Unreal.
6. Add a lifecycle test layer whose acquisition/release counters cover window, IPC handlers,
   CameraFeed, presentation workers, and an in-flight fixture launcher. Run it through one
   `ManagedRuntime` and prove exactly-once finalization on normal dispose, startup failure, and fiber
   interruption.

**Verify**:

```powershell
node scripts/test.mjs apps/workbench/src/main/workbench-live.test.ts
rg -n "Effect\.provide\(|Layer\.build|Scope\.make" apps/workbench/src/main --glob '!*.test.ts'
pnpm --filter @ue-shed/workbench typecheck
```

Expected: lifecycle cases pass; `Effect.provide` occurs only in named layer composition where
necessary, never IPC handlers; no manual scope construction/build remains; typecheck exits 0.

### Step 8: Cut IPC over feature by feature, then replace bootstrap

#### 8A. Thin feature registration modules

For each feature module in the target map:

1. Register only its listed channels through `ElectronIpc`.
2. Each handler receives already decoded input, yields one application/domain service, invokes one
   operation, and returns its schema-owned result.
3. Do not read config, construct layers, mutate shared state, parse error strings, or call any
   runtime method in a feature handler.
4. Add registration tests that invoke every channel through a fake IPC adapter and assert the exact
   service operation and encoded result. Include malformed input for every input-bearing channel.
5. Compose all registration effects in `ipc/register.ts`. Assert exactly 28 unique invoke channels
   and the one frame event.

#### 8B. Shared runtime adapter

The only Promise bridge for invoke handlers lives in `adapters/electron-ipc.ts`. It may capture the
Effect `Runtime` during scoped acquisition and use `Runtime.runPromise` for Electron callbacks.
Individual handlers must not call `ManagedRuntime.runPromise`, `Runtime.runPromise`, or
`Effect.run*`.

#### 8C. Bootstrap

Reduce `main.ts` to the foreign Electron lifecycle adapter:

1. Construct exactly one `ManagedRuntime.make(WorkbenchLive)`.
2. `app.whenReady()` triggers exactly one `runtime.runPromise(WorkbenchProgram.start)` call.
3. `window-all-closed` requests quit, preserving current all-platform behavior.
4. The first `before-quit` prevents exit, starts exactly one `runtime.dispose()`, waits for all
   finalizers, marks disposal complete, and calls `app.quit()` again. Subsequent quit events do not
   dispose twice or loop.
5. Startup failure is reported once, disposes the runtime, and quits non-successfully. Do not use
   console output as the product observability implementation; preserve enough startup diagnostics
   for this plan and leave telemetry enforcement to Plan 015.
6. Keep any unavoidable imperative disposal latch local to the bootstrap closure. No mutable
   module-level window, resource, connection, timer, map, set, service, or Promise is permitted.

After the new bootstrap is active, delete the old handler/workflow/global code from legacy
`main.ts`; do not leave an unused backup module.

**Verify**:

```powershell
node scripts/test.mjs apps/workbench/src/main/ipc apps/workbench/src/main/workbench-live.test.ts
rg -n "Effect\.run(Promise|Sync)|ManagedRuntime\.make|\.runPromise\(|ipcMain\.handle|process\.env|fetch\(|^let |new Map|new Set|setTimeout|setInterval" apps/workbench/src/main --glob '!*.test.ts'
pnpm --filter @ue-shed/workbench typecheck
```

Expected:

- one `ManagedRuntime.make` and one startup `runtime.runPromise` in the bootstrap;
- handler `Runtime.runPromise` only in `adapters/electron-ipc.ts`;
- no `Effect.runPromise` or `Effect.runSync`;
- direct `ipcMain.handle` only in the IPC adapter;
- no direct environment reads or raw fetch;
- no forbidden mutable module-level runtime state;
- typecheck exits 0.

### Step 9: Lock the architecture, run process gates, and mark complete

1. Update `scripts/check-effect-architecture.mjs` so removed main-process allowances are zero. Do not
   weaken another path's baseline. Keep preload and renderer Promise allowances for Plan 014.
2. Extend `scripts/check-effect-architecture.test.mjs` with Workbench-specific fixtures that reject:
    - a new main-process `Effect.runPromise`/`Effect.runSync`;
    - a direct `process.env` read;
    - raw `fetch`;
    - direct `ipcMain.handle` outside the approved adapter;
    - an Electron main import outside adapters/bootstrap;
    - a package import from `apps/workbench`.
3. Extend Playwright coverage:
    - keep the existing saved Data Authoring and Map Review smoke journey without Unreal;
    - explicitly prove application startup does not invoke the fixture launcher;
    - prove a user launch action invokes it once even under two concurrent clicks;
    - prove closing the Electron application while launch/polling is active exits cleanly;
    - preserve the gated real Map Review authoring journey.
4. For the demand-launch E2E, use a temporary fake source-checkout launch script and a local fake
   health endpoint controlled by the Playwright fixture. Before user action, assert no launch marker
   exists. After action, let the fake launcher create the marker and make the fake endpoint healthy.
   Do not add test-only branches to production services.
5. Run component tests because preload/result compatibility feeds maintained extensions.
6. Run the full Workbench production build/E2E and repository gate.
7. Inspect generated/cache pollution and remove only artifacts created by this plan.
8. Update Plan 013 to `DONE` in `plans/README.md` only after every gate below passes.

**Verify**:

```powershell
pnpm effect:architecture
pnpm test:architecture
pnpm --filter @ue-shed/workbench typecheck
pnpm test:components
pnpm test:e2e:workbench
pnpm test:fast
pnpm check
git diff --check
git status --short
```

Expected: every command exits 0; all non-environment-gated E2E specs pass; skipped real-Unreal gates
are reported with their documented enabling variables; status contains only intentional plan files
and implementation changes.

## Test plan by risk

### Lifecycle and cleanup

- Runtime acquires each scoped adapter/service once.
- Normal dispose removes all IPC handlers, interrupts workers, closes CameraFeed, destroys the
  window, and releases caches.
- Startup failure finalizes already acquired resources in reverse ownership order.
- Interruption during fixture launch kills only the launcher child and finishes runtime disposal.
- Window destruction prevents all later camera sends.
- Repeated `before-quit` cannot start a second disposal or trap Electron in a quit loop.

### Configuration and optional capabilities

- No project, review set, rules, authoring asset, repository root, or live endpoint beyond the
  default still starts Workbench.
- Saved inspection works without Unreal.
- Missing optional config returns current not-configured variants.
- Explicit malformed config produces a typed startup/config failure with recovery guidance.
- Acquiring `WorkbenchLive` produces zero fixture launches.

### IPC contracts

- All 28 invoke channels are registered exactly once and removed on finalization.
- Every input-bearing channel rejects malformed unknown input before its service is invoked.
- Every output is validated against the owning schema.
- Channel names and preload methods remain in exact parity.
- Defects and interruptions remain distinct from typed renderer results.

### Authoring correctness

- Catalog replacement is atomic and saved mode survives live connection failure.
- Concurrent catalog/connection requests deduplicate.
- Session service is acquired once per runtime, not once per handler.
- Apply, reconcile, and Save call domain operations exactly once.
- Indeterminate mutation results remain durable and visible.
- No loaded snapshot returns the existing useful failure rather than a defect.

### Fixture launch

- Already healthy, wrong project, missing review capability, missing launcher, launcher error,
  nonzero exit, readiness timeout, success, concurrent calls, retry, and cancellation.
- Launch is user-driven only.

### Camera presentation

- Latest frame wins per camera and replacement count increments truthfully.
- Aggregate byte budget paces frames deterministically.
- Slow renderer delivery remains bounded.
- Different camera indices make progress without starvation.
- Metrics combine feed, process, and presentation values.
- Runtime/window teardown sends no later frames.

### Process-level parity

- Production Electron build starts and shows at the same readiness point.
- Saved Data Authoring, Map Review history, and large-table navigation remain functional without
  Unreal.
- Demand launch is absent before the action and deduplicated after the action.
- Gated real Map Review authoring remains available.

## Done criteria

- [ ] `main.ts` is a minimal Electron/ManagedRuntime bootstrap with no domain imports.
- [ ] Exactly one `ManagedRuntime` owns the complete Workbench layer scope.
- [ ] Normal quit, startup failure, and interruption finalize every acquired resource exactly once.
- [ ] All 28 invoke channels decode unknown input through schema-owned contracts.
- [ ] IPC feature handlers invoke one application/domain service operation and contain no layers,
      runtime exits, config reads, or shared mutation.
- [ ] `Effect.runPromise` and `Effect.runSync` do not occur under `apps/workbench/src/main`.
- [ ] The only handler Promise bridge is the approved Electron IPC adapter; bootstrap has one startup
      `ManagedRuntime.runPromise` and one `dispose` path.
- [ ] Direct `process.env` and raw `fetch` do not occur under `apps/workbench/src/main`.
- [ ] No mutable module-level window, map, set, timer, connection, service, feed, or Promise remains.
- [ ] `TextureAudit`, `TextCorpusService`, `AuthoringCatalog`, `AuthoringSessions`, `ReviewCapture`,
      `ReviewAuthoring`, repositories, reader, Remote Control, and CameraFeed are composed as services
      in `WorkbenchLive`.
- [ ] Startup and window acquisition do not launch Unreal or invoke fixture health polling.
- [ ] Camera presentation remains bounded, latest-frame-wins, paced, interruptible, and silent after
      window close.
- [ ] Preload methods, IPC channel names, renderer-visible JSON/binary shapes, and exit behavior are
      unchanged.
- [ ] Packages do not import Workbench; deleting `apps/workbench` leaves domain packages and CLI
      tests intact.
- [ ] Architecture baselines reject reintroduction of the removed main-process patterns.
- [ ] Main Effect tests, Workbench typecheck, component tests, Workbench E2E, fast tests, and
      `pnpm check` all pass.
- [ ] `plans/README.md` marks Plan 013 `DONE` only after all gates pass.

## STOP conditions

Stop and report—do not improvise—if any of these occurs:

- A generic current workflow required by IPC exists only inside Workbench or would require a package
  to import Workbench.
- The drift check reveals a new/changed IPC channel, preload method, runtime resource, or Electron
  lifecycle since `c618729`.
- Optional absent configuration can only be modeled by failing `WorkbenchLive` startup.
- A public service must be reconstructed per handler because its layer cannot accept runtime
  configuration at acquisition.
- Apply/Save/reconcile would need to be reimplemented or automatically retried outside
  `AuthoringSessions`.
- Electron teardown cannot truthfully wait for a resource finalizer without losing or duplicating a
  mutation result.
- Fixture-process cancellation would kill or orphan a process not owned by Workbench.
- The camera presentation rewrite fails bounded/fair/no-post-close tests and a direct hot-path
  exemption is proposed without a benchmark and ADR update.
- Preserving the preload API requires renderer client or Solid-state changes assigned to Plan 014.
- Any checkpoint verification fails twice after a reasonable scoped correction.
- Completing a step requires an out-of-scope wire, Unreal plugin, product, or renderer change.

## Maintenance notes

- Plan 014 should consume the unchanged preload boundary and migrate renderer clients independently.
- Plan 015 should remove the remaining renderer/preload migration allowlists and add final telemetry
  enforcement; it must not rediscover main-process runtime exits removed here.
- Future IPC channels must add a contract entry, service operation, thin registration, malformed
  input test, preload parity test, and cleanup coverage.
- Future long-lived listeners/workers belong in an owning layer and must fork scoped work; handler
  registration is not a lifecycle owner.
- Future keyed caches must remain bounded, be built once in a layer, and choose success/failure TTLs
  by semantics. Do not restore Promise maps.
- Review the final diff especially for accidental Workbench-owned domain policy, hidden automatic
  Unreal launch, swallowed interruption, double disposal, and post-window camera sends.
