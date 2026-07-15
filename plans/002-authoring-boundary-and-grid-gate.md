# Plan 002: Freeze the authoring boundary and approve the grid dependency

> **Executor instructions**: Complete the decision and spike before adding a production dependency.
> Update `plans/README.md` when done. Do not interpret this plan as legal advice; obtain the approval
> required by the project owner for the intended distribution.
>
> **Drift check**: `git diff --stat 52df5c0..HEAD -- docs packages/authoring-sdk extensions/data-authoring package.json pnpm-lock.yaml`
> Reconcile any changed product or dependency boundary before continuing.

## Status

- **Priority**: P0
- **Effort**: S (hours to one day)
- **Risk**: HIGH — the proposed UI dependency is `GPL-3.0-only` while UE Shed has not selected a
  publication license
- **Depends on**: none
- **Planned at**: commit `52df5c0`, 2026-07-15

## Outcome

Produce an explicit go/no-go decision for Peculiar Sheets and narrow the authoring roadmap to the
maintained first-party editor, CLI, and trusted host-neutral client. Custom UI hosting is out of this
roadmap. If the grid is approved, prove the exact public API and stylesheet can compile in the Solid
and StyleX build without yet replacing the current read-only route.

## Current evidence

- Electroswag uses `peculiar-sheets@^0.9.0`; registry metadata on 2026-07-15 reports `0.9.1` as the
  latest version and `GPL-3.0-only` as its license.
- `docs/vision-and-architecture.md` requires dependency license tracking and intentionally leaves the
  project's publication license undecided.
- `docs/products/data-authoring.md` and `packages/authoring-sdk/README.md` still promise custom UIs,
  grants, and isolation even though that platform is not required for the first-party editor.
- The current 671-line `authoring-route.tsx` owns a bespoke CSS grid. Electroswag's useful public API
  surface is small: `Sheet`, stable row/column IDs, `ColumnDef`, `Selection`, `SheetOperation`, and a
  controller. Its large renderer/store and private `.se-*` DOM hooks are not architectural input.

## Work

1. Record an ADR with the dependency version, source, license, transitive HyperFormula status,
   intended distribution, decision owner, and go/no-go outcome. Pin an exact version if approved.
2. Record that arbitrary custom UI hosting is deferred indefinitely. Update the product architecture
   to retain a public headless service and a trusted browser-safe client for the maintained extension;
   remove slice E and security/platform promises that are not being built.
3. Decide whether `@ue-shed/authoring-sdk` is renamed/redefined as that narrow trusted client or
   retired in favor of an equivalent public package. Do not leave a placeholder with broader claims.
4. In a disposable or test-only spike, compile a minimal Solid component using the exact candidate
   version with read-only data, stable row IDs, selection, and the vendor stylesheet. Do not add
   formulas, HyperFormula construction, private selectors, or Electroswag source.
5. Document the adapter rule: all Peculiar imports, branded index conversions, and vendor CSS live at
   one extension-local boundary; product/session code sees semantic intents only.
6. Add a conformance ledger to `docs/products/authoring-conformance.md` with statuses `planned`,
   `pure-tested`, `adapter-tested`, `unreal-tested`, and `product-tested`, plus the proving command.

## Verification

- `pnpm view peculiar-sheets version license repository dependencies --json`
- `pnpm --filter @ue-shed/data-authoring typecheck`
- `pnpm --filter @ue-shed/workbench build`
- `pnpm check`

The ADR, product docs, SDK description, and dependency manifest must tell the same story. If approved,
the spike compiles using only public APIs and no `.se-*` selector. If rejected, leave production
manifests unchanged and replace Plan 005's library choice before marking this plan done.

## STOP conditions

- The project owner has not approved the dependency terms for the intended distribution.
- The exact pinned version cannot build without undocumented DOM/CSS hooks.
- The proposed solution requires copying or forking Electroswag code.
- A custom-UI platform is reintroduced without a separate product decision and threat model.
