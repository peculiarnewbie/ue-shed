# `@ue-shed/unreal-assets`

The process and compatibility boundary for read-only inspection of saved Unreal asset packages. It
discovers a compatible `uasset` executable, validates its versioned CLI JSON output, and returns
normalized package evidence with explicit partial and unsupported results.

Its authoring payload is derived from the same language-neutral schema and snapshot contract emitted
by `UEShedAuthoring`; it is not a second package-reader-specific authoring model.

This package owns process execution, schema-version negotiation, limits, and diagnostics. It does not
own DataTable authoring policy, live editor state, mutation, or Save.

Set `UE_SHED_UASSET_EXECUTABLE` to a compatible reader executable or pass an explicit executable to
the library. `readSavedTable` invokes `uasset authoring <asset> --format json` and validates every
result against the shared runtime contract. Exit code 6 is a successful partial result, not a process
failure.
