# Integration design: libraries you depend on, slices you copy

Date: 2026-07-16. Status: agreed direction, synthesized from `agent1.md`, `agent2.md`, and the
follow-up discussion. Supersedes the package-publication framing in both agent documents.

## The problem this solves

An agent pointed at the repository took a long time to integrate UE Shed and ended up copying the
entire showcase Electron shell. That was a rational response to the repository, not an agent
mistake: Workbench is the only complete, working composition, the README routes everyone to
`pnpm showcase`, and no smaller adoptable unit exists. The fix is not npm publication. UE Shed is
deliberately a source-distributed project for the agentic era: consumers pull working capability
into their own project quickly, then branch out. Clean registry-style packaging is not a realistic
expectation for the gaming space and is not the goal.

## The model: two zones

UE Shed splits into two zones with different contracts and different disciplines. Externally,
describe them by behavior, without lineage framing: **the libraries, which you depend on and
update; and the workflow slices, which you copy into your project and own.**

### The kernel (depend on it, track upstream)

- `crates/uasset-parser` and its versioned JSON contract
- `packages/protocol`, `unreal-assets`, `unreal-connection`, `engine-discovery`
- domain services: `authoring`, `authoring-catalog`, `game-text`, `cameras`, `asset-audits`
- the SDK client contracts (`authoring-sdk` and each extension's client shape)
- the `@ue-shed/host` composition root (once extracted; see below)
- the Unreal plugins (`UEShedCore` above all — divergent forks of the wire protocol are the worst
  outcome this design prevents)

The kernel is built assuming consumers depend on it and pull updates. Forking it is possible, not
supported: whoever forks inherits the merge burden. Kernel changes stay legible — small commits
against versioned contracts, contract-change notes — so even a diverged fork can cherry-pick a
critical fix cheaply. We are kind to forks without supporting them.

Kernel discipline (this is "package-shaped" as a design discipline, decoupled from publishing):
explicit entry points, no circular dependencies, no toolchain leakage across the zone boundary,
versioned wire contracts, changelogs, zero UI imports.

### The slices (copy them, own them)

- `extensions/*` — routes, grids, views
- client implementations (the direct in-process client and any transport bridge)
- host shells (the minimal example host; Workbench pieces)
- `ui` primitives and `ui-theme` StyleX tokens (restyling happens by editing the copied tokens,
  not through a theme API)

The unit is a **workflow slice**: route + UI + client wiring + conformance tests, vertically. That
raises the bar on self-containment and creates a new invariant: **everything demonstrable in the
showcase exists as a pullable slice.** (`camera-lab.tsx` currently lives loose in the Workbench
renderer and violates this; it moves into an extension.)

Slices are primarily **on-ramps, not the durable adoption surface**. They get the showcase
capability running in a consumer's project fast; serious adopters are expected to diverge freely
or generate their own frontends against the kernel's client contracts. The durable public surface
is therefore the kernel contracts plus the executable conformance tests — the slice is a working
reference an agent can learn from, mutate, or regenerate.

The zone boundary is exactly the existing client contract: a copyable route talks to a kernel
client shape. The architecture already drew this line; this design makes it the distribution line.

## Decisions

### 1. Kernel supply: vendored snapshot with provenance

Adoption copies the kernel too — into a clearly marked "yours to update, not to edit" area with
the upstream commit recorded. Updates are mechanical re-pulls against versioned contracts. This
works today with a private repository and zero publishing infrastructure, and can graduate to
git-pinned or published dependencies later without changing the model. Publication remains a
deferred rights-holder decision, not a prerequisite.

### 2. Slice builds: the consumer adopts the toolchain

Slices stay pure Solid + StyleX source. The slice manifest includes the exact build wiring
(vite/Solid/StyleX plugins), and the consumer's agent performs that wiring as part of adoption —
a documented, scripted step, not archaeology. Precompiled CSS remains a fallback if real adoption
friction shows up; it is not built speculatively. This is acceptable precisely because slices are
showcase on-ramps: the toolchain cost is paid once, by an agent, to get a working reference
running.

### 3. Adoption mechanism v1: manifest plus agent doc

Each slice ships a machine-readable manifest — files to copy, kernel dependencies, toolchain
steps, conformance tests to run — plus a short per-slice document addressed to the consumer's
agent. No `adopt` CLI in v1; a CLI can consume the same manifests later once adoption patterns
are observed. Documentation-only (no manifest) was rejected because nothing executable would keep
it from drifting, which is the failure mode this design exists to prevent.

## What carries over from the agent documents

From both (converged diagnosis): extract the generic composition root out of
`apps/workbench/src/main/workbench-live.ts` into a real `@ue-shed/host`; CLI and Workbench become
two adapters of the same seam; Workbench-owned feature services move into public packages; the
README stops funneling integrators into `pnpm showcase`.

From agent2: direct in-process client implementations (`XClientLive`) next to every client
contract, and a schema-derived transport bridge so any host transport is a small adapter — this is
what makes "get the showcase part running in your project" fast, and what makes generated
frontends cheap to wire. The fresh-agent acceptance eval (below).

From agent1: conformance as the gate (adapted — it verifies adopted copies in a fresh external
project rather than packed npm artifacts); the imitation ladder of reference integrations with
explicit "safe to copy / intentionally shell-specific" annotations; the guardrails (host must not
become a framework; Workbench-specific IPC must not be the only embedding contract; examples are
not done until exercised by the gate).

Dropped from both: npm publication as a prerequisite, and release-shaped package artifacts as the
integration surface. The discipline transforms rather than disappears: the copy-unit must be
toolchain-portable, and the adoption gate tests copies, not tarballs.

## Acceptance

A fresh agent, given only a slice's manifest/doc and a blank project, gets that slice running —
and diverging — without touching `apps/workbench`, within a bounded session. Rerun this eval
whenever the adoption surface changes; "point an agent at it" is this project's cheapest honest
integration test and is now a designed-for scenario. The mechanical complement: CI adopts each
slice into a fresh temporary project from its manifest and runs its conformance tests there.

## Sequencing

After plan 014 (Effect-native renderer/extension clients — already relocating client contracts
into extensions), before plan 007 grows more workflow code on the current shape. Proposed
plan 016 scope: host extraction, direct clients and transport bridge, the slice manifests and
per-slice agent docs, the minimal non-Electron example host, the camera-lab slice move, the
adoption CI gate, and the README/Getting Started rewrite (integration outcomes first, Workbench
last, stated as the ceiling rather than the starting template).

## Open gates

- **Licensing is more urgent under vendoring, not less:** slices and kernel snapshots physically
  land in studio repositories. "No license yet" stops functioning as a passive shield at the first
  external adoption; the existing publication gates apply to the first shared slice.
- The kernel-supply mechanism should be revisited once the repository's visibility changes;
  vendored-snapshot-with-provenance is the v1 answer, not the terminal one.
