# Designing UE Shed for third-party (and agent) integration — agent2

Date: 2026-07-16. Prompt: our core and showcase story are solid, but integrating UE Shed into
someone else's project is not designed. An agent pointed at the repo took a long time and ended up
copying the entire showcase Electron shell. Diagnose why, and propose a design.

## Diagnosis: why the agent copied the Electron shell

The architecture docs promise "another trusted host can embed the same extension without inheriting
Workbench," and the contracts genuinely support that — every extension defines a narrow Effect
`Context.Service` client shape (`AuthoringClientShape`, `MapReviewClientShape`, ...) that a host
implements. The problem is that today Workbench is the only place where that promise is cashed in,
so an outside agent rationally concludes the shell is the product. Four concrete gaps cause this:

### 1. There is no consumable distribution

Every package is `private: true` and exports raw source:

```json
"exports": { ".": { "types": "./src/index.ts", "default": "./src/index.ts" } }
```

Nothing builds to `dist`, nothing is packable. To run any of it a consumer must adopt this
monorepo's exact toolchain: pnpm workspace catalogs, the shared tsconfig, the Solid JSX transform,
the StyleX compiler, the in-repo Rust parser build. "Integrate UE Shed" therefore literally means
"become UE Shed's repository" — copying the whole tree is the only path that works.

### 2. The composition root lives in the app, not the library

`packages/host` is a README. The real composition root — the topologically sorted layer graph in
`apps/workbench/src/main/workbench-live.ts` — interleaves generic layers (`AssetReaderLive`,
`RemoteControlClientLive`, `AuthoringCatalogLive`, `TextureAuditLive`, ...) with Electron adapters
(app, window, IPC, dialog) inside the same functions. An integrator has to reverse-engineer which
of the ~4,500 lines of main-process glue is "UE Shed" versus "Electron packaging." Worse,
feature-level orchestration such as `WorkbenchAuthoringLive` and `WorkbenchMapReviewLive` lives in
`apps/workbench/src/main/services/`; a second host would have to rewrite it, not import it.

### 3. Client contracts have no in-process reference implementation

The only implementation of each client shape is Workbench's five-file relay: renderer client →
preload → `ipc-contracts` → main IPC handler → workbench service. There is no `AuthoringClientLive`
that runs the domain services directly in one process — which would be the ~30-line embedding story
for any Node-backed host, and the natural test double.

### 4. All documentation faces inward, and the README routes everyone to `pnpm showcase`

Vision, plans, product contracts, and engineering guides exist; nothing answers "I have my own app,
how do I put Data Authoring in it?" Agents copy the smallest working thing they can find; the only
working thing here is the showcase.

Note: the in-flight working tree is already moving client contracts out of the workbench renderer
into extensions (`extensions/asset-audits/src/texture-audit-client.ts`,
`extensions/game-text/src/game-text-client.ts`). Necessary, not sufficient.

## Design: make the "second host" a product deliverable, not a hypothetical

The deletion test is currently an architectural belief; turn it into executable artifacts. Five
pieces, roughly in dependency order.

### 1. Make `@ue-shed/host` real: extract the headless composition root

Pull the generic layer graph out of `workbench-live.ts` into something like `ShedHostLive(config)`
in `@ue-shed/host` — asset reader, connection, catalogs, domain services — driven by a
schema-validated config instead of Electron/env plumbing. Workbench becomes `ShedHostLive` +
Electron adapters + IPC registration; workbench-owned feature services (`WorkbenchAuthoringLive`
and friends) move down into public packages where they are not Electron-touched. After this the
deletion test enforces itself: anything left in `apps/workbench/src/main` is packaging by
definition.

### 2. Ship a direct client implementation next to every client contract

For each `XClientShape`, the SDK package should export `XClientLive` — in-process, backed directly
by the domain services. Embedding then reads: provide `ShedHostLive`, render
`<AuthoringRoute client={...}>`, done. Workbench's IPC-bridged clients become one alternative
implementation.

Because every contract is already Effect Schema end-to-end, go one step further and mechanically
derive a transport-bridged client from the schema-typed interface: a generic "client over any
request/response transport" helper collapses Workbench's hand-written five-file relay per feature
and makes WebSocket/HTTP/Electron-IPC hosts each a ~20-line adapter. This is the highest-leverage
abstraction in the whole story.

### 3. Decide the distribution question deliberately

Even while the repo stays private, packages need built output (`dist` + `.d.ts`) so a consumer does
not inherit our compiler settings. The StyleX question needs an explicit answer for UI packages:
precompiled CSS per extension, or a documented "you must run the StyleX plugin" requirement.
Precompiled is strongly preferred — requiring a bundler plugin is exactly the friction that makes
agents give up and vendor. Acceptance bar: `pnpm pack` tarballs installable from a fresh project.
Publishing to npm later becomes a switch, not a project.

### 4. Add an `examples/` directory with a CI-tested minimal host

One example that is deliberately not Electron — e.g. a plain Vite + Solid page embedding the
authoring extension over a small Node host process — plus a headless-automation script using only
libraries. Keep each under a few hundred lines and run them in CI against the fixture. This is
simultaneously the proof of the deletion test and the right thing for an agent to copy. Agents
pattern-match on the nearest working example; today that is `apps/workbench`, and no amount of
documentation outweighs a working example pointing the other way.

### 5. Write integration docs for agent consumption, and route to them from the README

A `docs/integration/` guide (or top-level `INTEGRATING.md`) written imperatively: what to depend
on, the client-contract pattern, the layer recipe, transport options, and an explicit "never copy
`apps/workbench`; copy `examples/embed-authoring` instead." Pair it with a conformance angle the
repo already invented for authoring: a small test kit a host author (human or agent) runs against
their client implementation, so "am I integrated correctly?" has an executable answer rather than a
vibe.

## Sequencing and acceptance

Plan 014 (Effect-native renderer/extension clients) touches exactly this surface and is already in
flight — fold the client-contract relocation into it as planned, then add a new plan
("016: second host and embedding contract") covering host extraction, direct clients, the example
host, and packaging, sequenced before plan 007 grows more workflow code on the current shape.

Acceptance criterion, in house style: a fresh agent, given only the integration doc and a blank
Vite + Solid app, embeds Data Authoring without touching `apps/workbench` — rerun that eval
whenever the surface changes. "Point an agent at it" turned out to be a cheap, honest integration
test; design for it on purpose.
