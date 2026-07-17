# Adopt the Data Authoring slice

Use [`adoption.manifest.json`](adoption.manifest.json) as the executable source of truth. This guide
is addressed to the coding agent performing the adoption.

## Ownership boundary

- Copy entries under `copy.kernel` into a provenance-marked area. Record the UE Shed commit and pull
  upstream fixes deliberately. Do not casually edit these files.
- Copy entries under `copy.owned` into the consuming project. The route, primitives, and StyleX theme
  are an on-ramp that the adopter owns and may change freely.
- Do not copy `apps/workbench`. It is an Electron showcase adapter, not an integration template.

## Required wiring

1. Install the dependencies declared by the copied package manifests.
2. Configure Vite with Solid first and `@stylexjs/rollup-plugin` second.
3. Set `runtimeInjection: command === "serve"` for styled development. Keep `fileName:
"stylex.css"` for production extraction and link that file from the built page.
4. Provide an `AuthoringClientShape` to `AuthoringRoute`. A browser host must use its own trusted
   transport or an in-memory implementation; it must not gain filesystem, process, or raw Unreal
   authority.
5. Wrap the route in `EffectRuntimeProvider` and apply one copied StyleX theme at the host root.

Run `pnpm test:adoption:data-authoring` in UE Shed to see the complete blank-project recipe exercised.
The deterministic gate copies only the manifest closure, typechecks without Node types, produces
non-empty production CSS, rejects Workbench imports, edits a copied theme token, and proves the CSS
changes.

Licensing remains a deliberate external-distribution gate. This manifest proves local/private
adoption mechanics; it does not publish packages or grant rights.
