# Agent 1: Integration-first host architecture

## Summary

UE Shed's internal architecture is already substantially headless-first, but its repository and
distribution shape do not yet communicate a small, supported integration path. A person or coding
agent trying to integrate UE Shed is therefore likely to copy UE Shed Workbench: it is the only
complete graphical composition example and the root getting-started flow leads directly to it.

The architectural goal should be stronger than ensuring that deleting Workbench leaves the domain
packages intact. Another project should be able to install a deliberately small set of packages,
compose a useful capability without studying either executable, and verify that integration outside
the monorepo.

## Evidence in the current repository

- The root README leads with `pnpm showcase` in Getting Started.
- Every TypeScript package is currently private.
- Package exports point directly to TypeScript source; there are no package build, `files`, prepack,
  or publication checks.
- `@ue-shed/host` has only a README and no implementation.
- The CLI and Workbench contain the only complete runtime composition graphs.
- The Workbench renderer owns the concrete IPC client adapters used to embed the maintained product
  extensions.
- There is no `examples/`, starter, or quickstart project showing a minimal external consumer.
- Existing tests prove workspace consumers, but none packs the packages and installs them into a
  fresh external project.

This makes copying Workbench a rational choice rather than merely an agent mistake.

## Recommended design

### 1. Deepen `@ue-shed/host`

Implement `@ue-shed/host` as the host-neutral composition module promised by the vision. It should
concentrate reusable capability composition, configuration, lifecycle, and diagnostics behind one
small interface. It should not contain Electron, stdout, studio policy, or arbitrary third-party UI
hosting.

The CLI and Workbench should become two real adapters at this seam:

- the CLI adapts arguments, stdout, exit status, and process lifetime;
- Workbench adapts Electron lifecycle, dialogs, windows, IPC, and presentation state;
- another trusted tool can provide its own adapters without reconstructing UE Shed's domain graph.

This creates leverage for callers and locality for composition policy. Today, equivalent knowledge
is spread through `apps/cli/src/application.ts` and `apps/workbench/src/main/workbench-live.ts`.

The deletion test should be extended accordingly: deleting either application should not delete the
only documented or executable recipe for composing a capability.

### 2. Make selected public packages release-shaped

Choose a small supported public spine rather than publishing every workspace package. Those selected
packages should:

- emit JavaScript and TypeScript declarations;
- expose deliberate entry points instead of source files;
- separate Node-only and browser-safe entry points;
- declare supported runtime, peer, and optional dependencies;
- define a compatibility and versioning policy;
- include only intended files in the package artifact.

The exact public package set should follow the first external workflows. Internal package structure
does not need to become a permanent public commitment.

### 3. Make an external consumer the conformance gate

Add a release-shaped integration test that packs the selected packages, installs them into a fresh
temporary project, and exercises them without workspace resolution or source imports.

At minimum, it should prove:

1. a Node project can install, typecheck, and run one saved-asset/headless workflow;
2. a browser project can install, typecheck, and bundle one maintained extension using a supplied
   client adapter;
3. Node-only dependencies do not leak into browser entry points;
4. package artifacts contain every required runtime file and no unintended internal surface.

The package artifact, rather than the monorepo, then becomes the integration test surface. Minimal
examples can be executed by the same gate so they cannot silently drift.

### 4. Add progressive reference integrations

Provide a deliberate imitation ladder:

1. a tiny headless script for one capability;
2. a minimal maintained-UI host;
3. the CLI as a complete automation adapter;
4. Workbench as the full showcase and dogfood client.

Each reference integration should be narrowly scoped and state:

- the outcome it demonstrates;
- which package entry points are supported;
- which lifecycle and configuration concerns UE Shed owns;
- which concerns the integrating project owns;
- expected failures and recovery guidance;
- which files are safe to copy or adapt;
- which Workbench files are intentionally shell-specific.

Workbench should be presented as the ceiling of what can be composed, not as the starting template.

## Documentation for humans and agents

The top-level documentation should start with the integration outcome rather than the showcase:

- run UE Shed from the CLI;
- add a headless capability to an existing Node tool;
- embed a maintained UE Shed interface in a trusted host;
- build a complete custom host;
- explore the Workbench showcase.

Use consistent headings and terminology across public package READMEs so coding agents do not need
to infer ownership from source layout. A canonical integration guide should explicitly direct agents
to the smallest reference matching their task and warn that `apps/workbench` is an Electron adapter,
not a starter application.

Avoid maintaining a second prose-only machine guide that can drift from the executable examples.
Prefer short documentation generated from, or directly tested alongside, package metadata and the
external-consumer fixtures.

## Recommended sequencing

1. Finish the current Effect renderer migration so browser client contracts and lifetime ownership
   are stable.
2. Select one external headless workflow and one maintained-interface embedding workflow as
   acceptance cases.
3. Deepen `@ue-shed/host` until both CLI and Workbench use its reusable composition policy.
4. Make only the packages needed by those acceptance cases release-shaped.
5. Add pack-and-install conformance and the two minimal reference integrations.
6. Rewrite Getting Started around integration outcomes, placing Workbench last.
7. Resume broader rich-authoring and roadmap expansion after the external seam is proven.

This should be treated as a P0 integration track before adding substantially more domains. Every new
domain added first would otherwise increase the amount of composition knowledge external callers
must reverse-engineer.

## Guardrails

- Do not turn `@ue-shed/host` into a universal framework or a speculative runtime extension system.
- Do not publish every internal package by default.
- Do not move Electron, filesystem UI, or studio policy into the host-neutral module.
- Do not use Workbench-specific IPC as the only supported embedding contract.
- Do not consider an example complete unless it is tested from packed package artifacts.
- Preserve demand-driven Unreal launch and capability-driven optional integrations.
- Keep the core and maintained workflows usable from libraries and the CLI without Workbench.

## Top recommendation

Deepen `@ue-shed/host` first. It removes the reason callers must study either executable. Package
release shaping, external-consumer conformance, reference integrations, and clearer documentation
can then all exercise the same proven seam.
