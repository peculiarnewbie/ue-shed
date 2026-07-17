# UE Shed

**External tools for Unreal Engine development.**

UE Shed is an early-stage, headless-first suite of libraries, protocols, Unreal companion plugins,
and reference applications. It is built around a simple idea: some tools are essential when you
need them, but they should not have to live inside every game project or dictate a studio's desktop
workflow.

The repository is intentionally a clean implementation. Existing internal Swag tooling can inform
behavior and product lessons, while this codebase establishes a generic public boundary from the
start.

## Status

This is an architectural scaffold, not a release. The first proving domain is the batteries-included
DataTable authoring product, beginning with a reproducible Unreal fixture and a headless read-only
spine. The actor observatory follows as the first data-plane and real-time domain.

The first headless path is executable:

```powershell
pnpm ue-shed authoring inspect fixtures\unreal-project\Content\Fixture\Authoring\DT_Scalars.uasset
```

From a source checkout, the command incrementally builds and uses the in-repo Rust parser. Set
`UE_SHED_UASSET_EXECUTABLE` only when testing another compatible reader build.

Use `pnpm ue-shed help` for persistent session creation, typed cell drafting, undo, and redo commands.

Read [the vision and architecture](docs/vision-and-architecture.md) for the decisions, repository
shape, first MVP, and open-source guardrails. Read
[the engineering index](docs/engineering/README.md) for focused guidance on functional design,
TypeScript, Effect, SolidJS, StyleX, observability, and testing.

## Principles

- Headless capabilities first; graphical clients consume the same public interfaces.
- A complete, safe DataTable workflow delivered through reusable libraries and a first-party UI.
- SolidJS product extensions with StyleX tokens and locally owned, statically checked styles.
- A small, separately enabled Unreal plugin suite instead of one permanent monolith.
- Versioned, language-neutral wire contracts with runtime validation.
- Stock Unreal installations and reproducible generic fixtures as the baseline.
- Static extension composition until a real need justifies runtime plugin loading.
- No studio-project assumptions in public packages, fixtures, examples, or documentation.

## Choose an integration

Use the headless CLI when you want DataTable inspection or authoring automation without a desktop
host:

```powershell
pnpm install
pnpm ue-shed --help
```

Embed the maintained Data Authoring UI in a Solid/Vite host by following its
[adoption guide](extensions/data-authoring/ADOPTING.md) and
[machine-readable manifest](extensions/data-authoring/adoption.manifest.json). The conformance gate
materializes a fresh copied workspace, typechecks it, builds its production CSS, and proves that its
owned theme can diverge:

```powershell
pnpm test:adoption:data-authoring
```

Build a trusted non-Electron host with `ShedHostLive` and the direct `AuthoringClient` by starting
from the [headless authoring example](examples/authoring-headless/README.md). The browser slice stays
on the same client contract; choosing a browser-to-host transport remains the embedding host's
responsibility.

## Explore the showcase

```powershell
pnpm install
pnpm showcase
```

The showcase builds and opens Workbench without launching Unreal. Headless DataTable inspection and
saved-asset texture audits are immediately available; live texture previews and Camera Load Lab offer
in-product actions that build and launch the fixture only when requested. The source checkout also
incrementally builds its in-repo `uasset` reader. See
[the showcase walkthrough](docs/showcase.md) for prerequisites and exact demo flows.

For repository development:

```powershell
pnpm check
```

The repository is private and unpublished until licensing, trademark, provenance, and dependency
reviews are complete.
