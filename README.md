# UE Shed

**External tools for Unreal Engine development.**

UE Shed is an early-stage, headless-first suite of libraries, protocols, Unreal companion plugins,
and reference applications. The repository is intentionally a clean implementation: existing
internal Swag tooling can inform behavior, while this codebase establishes a generic public boundary
from the start.

## Status

Not a release. The batteries-included Data Authoring product is the flagship proving track. Texture
Audit, Game Text, Camera Load Lab, and Map Review exercise the same headless-first architecture.
See [the showcase walkthrough](docs/showcase.md) for the current demo set and how to run them.

```powershell
pnpm install
pnpm ue-shed authoring inspect fixtures\unreal-project\Content\Fixture\Authoring\DT_Scalars.uasset
pnpm showcase
```

From a source checkout, CLI commands incrementally build and use the in-repo Rust parser. Set
`UE_SHED_UASSET_EXECUTABLE` only when testing another compatible reader build. Use
`pnpm ue-shed help` for the full command surface.

Start at [the docs index](docs/README.md). It routes to vision, engineering, product contracts,
showcase, decisions, ideas, and research.

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

Use the headless CLI when you want automation without a desktop host:

```powershell
pnpm install
pnpm ue-shed --help
```

Embed the maintained Data Authoring UI in a Solid/Vite host by following its
[adoption guide](extensions/data-authoring/ADOPTING.md) and
[machine-readable manifest](extensions/data-authoring/adoption.manifest.json):

```powershell
pnpm test:adoption:data-authoring
```

Build a trusted non-Electron host with `ShedHostLive` and the direct `AuthoringClient` by starting
from the [headless authoring example](examples/authoring-headless/README.md). The browser slice stays
on the same client contract; choosing a browser-to-host transport remains the embedding host's
responsibility.

Product walkthroughs, live Unreal setup, and review-video recording live in
[docs/showcase.md](docs/showcase.md).

For repository development:

```powershell
pnpm check
```

The repository is private and unpublished until licensing, trademark, provenance, and dependency
reviews are complete.
