# 0005: Gate Peculiar Sheets and defer arbitrary custom authoring UI

## Status

Accepted on 2026-07-15.

The Peculiar Sheets rights holder explicitly approved adding and distributing the dependency in UE
Shed. UE Shed's own publication license and release review remain separate decisions.

## Context

The maintained Data Authoring extension needs spreadsheet interaction, virtualization, selection,
keyboard navigation, and batch editing. Electroswag demonstrates that Peculiar Sheets can provide
that interaction layer, but its renderer and session store are internal behavioral references rather
than code or architecture to copy.

Registry metadata checked on 2026-07-15 reports:

- package: `peculiar-sheets`
- candidate version: `0.9.1`
- source: `https://github.com/peculiarnewbie/spreadsheets`
- license: `GPL-3.0-only`
- relevant transitive dependency: `hyperformula@^3.0.0`

UE Shed is private and deliberately has no selected publication license. Dependency and rights-holder
review are publication gates, so technical suitability alone cannot authorize distribution.

The authoring roadmap also described arbitrary studio-authored and generated interfaces. That would
require grants, isolation, publishing, compatibility, and a security model that the maintained editor
does not need.

## Decision

- Do not add Peculiar Sheets to a production manifest until its GPL terms are explicitly approved for
  the intended UE Shed distribution.
- If approved, pin the exact reviewed version. Do not rely on a caret range while the library is on a
  pre-1.0 API.
- Put all Peculiar runtime imports, branded row/column conversions, operation decoding, and vendor CSS
  behind one adapter in `extensions/data-authoring`.
- Expose UE Shed table/view models to the adapter and emit semantic authoring intents from it. The
  grid never owns drafts, validation, Apply, Save, or persistence.
- Use documented component props, operation types, and controller methods only. Do not query private
  `.se-*` DOM nodes or override private selectors.
- Do not instantiate HyperFormula or expose formulas unless a later product requirement and separate
  dependency review justify them.
- Defer arbitrary custom authoring UI hosting indefinitely. Continue to support the maintained
  first-party extension, CLI automation, and trusted hosts embedding the maintained interface.
- Narrow `@ue-shed/authoring-sdk` to the browser-safe client contract used by that maintained
  interface. It is not an untrusted-extension SDK or capability sandbox.

## Consequences

The authoring domain remains usable without Workbench and replaceable without Peculiar Sheets. A
license rejection changes the grid implementation choice, not the session, protocol, CLI, or product
contracts. Deferring custom UI removes speculative security and platform work without removing named
views, row-detail surfaces, or purpose-built maintained extensions.

No source from Electroswag is copied. Its observable behavior may inform conformance cases.

## Approval record

The repository owner stated that they own Peculiar Sheets and approved the dependency after being
shown the exact `0.9.1` version, its `GPL-3.0-only` metadata, the HyperFormula dependency, and the
potential GPL distribution obligations. The approved scope is UE Shed development and distribution;
the package must remain exactly pinned until a later dependency review.

## Implementation evidence

`peculiar-sheets@0.9.1` is pinned exactly in the Data Authoring extension. The initial browser adapter
uses only `Sheet`, `rowId`, `ColumnDef`, `Selection`, and the published stylesheet. It is read-only,
does not instantiate HyperFormula, does not use private selectors, and converts UE Shed values in a
separate pure model. The extension typecheck, adapter model tests, and Workbench production build
prove the candidate API and CSS boundary.
