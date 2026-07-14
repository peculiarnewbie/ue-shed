# Showcase

The showcase is the shortest path from a fresh clone to UE Shed's three implemented proving
slices. It uses the committed generic fixture as its default project and keeps live Unreal an
optional capability.

## Open the Workbench

Requirements are Node.js 22.14 or newer, pnpm 10, and Rust 1.85 or newer. The live Camera Load Lab
also requires Unreal Engine 5.7 and Visual Studio 2022 with the Unreal Engine C++ workload. The
Workbench-only mode does not require Unreal or Visual Studio. From the repository root:

```powershell
pnpm install
pnpm showcase
```

`showcase` incrementally builds the in-repo `uasset` reader and Workbench, builds and launches the
Unreal fixture on its committed camera map, waits for Remote Control, and then opens the showcase
catalog. It also configures the fixture project and texture-audit rules for saved-asset demos.

To skip Unreal and open only the saved-asset side of Workbench:

```powershell
pnpm showcase -- --workbench-only
```

The source-checkout flow uses `target/debug/uasset.exe` (`target/debug/uasset` on other platforms).
To exercise another compatible reader build instead, override it before launching:

```powershell
$env:UE_SHED_UASSET_EXECUTABLE = "C:\path\to\uasset.exe"
pnpm showcase
```

The readiness strip reports whether the fixture preset, reader, and live Unreal endpoint are
available. A missing live endpoint does not prevent the saved-asset demos from opening.

## Demo 1: DataTable authoring

Use **Copy CLI demo** on the showcase home, then run the copied command from a repository shell. The
first command inspects the committed scalar table without opening Unreal:

```powershell
pnpm ue-shed authoring inspect fixtures\unreal-project\Content\Fixture\Authoring\DT_Scalars.uasset
```

Run `pnpm ue-shed help` to continue through persistent sessions, typed cell drafts, undo and redo.
Live apply and save use the same session model after the fixture editor is running.

## Demo 2: Texture Asset Audit

Choose **Open audit**. The route immediately scans the committed texture corpus using
`FixtureSource/Audits/texture-rules.json`; use **Rescan** to repeat it. It demonstrates whole-corpus
distributions, per-asset serialized evidence, findings, and partial-package diagnostics without
launching Unreal.

## Demo 3: Camera Load Lab

Camera Load Lab is the live slice. The default `pnpm showcase` flow discovers Unreal Engine 5.7,
incrementally builds the fixture editor target, and launches `/Game/Fixture/Cameras/L_CameraLoad` as
a windowed Game world. Stock Remote Control starts on loopback port `30001`; Workbench opens after
that endpoint is ready.

The lab connects automatically and reports scheduler, render/readback, transport, and presentation
measurements separately. If you already have a process listening on the configured fixture endpoint,
the launcher reuses it rather than starting another Unreal process.

## Using another project

The launcher defaults are only showcase presets. Override them with environment variables:

```powershell
$env:UE_SHED_PROJECT_ROOT = "C:\path\to\Project"
$env:UE_SHED_TEXTURE_AUDIT_RULES = "C:\path\to\texture-rules.json"
$env:UE_SHED_REMOTE_CONTROL_ENDPOINT = "http://127.0.0.1:30001"
pnpm showcase
```

Workbench remains a client of public packages. Deleting it does not remove the CLI or any domain
capability demonstrated here.
