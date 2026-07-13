# `@ue-shed/authoring`

The headless engine for a complete DataTable workflow: discovery, schema and snapshots, staged command
sessions, undo/redo, validation, drift detection, conflict resolution, Apply, and Save. It remains
independent from any desktop shell or studio-specific schema.

It consumes authority-tagged snapshots through narrow interfaces. Saved project packages provide a
first-class read-only authority through `@ue-shed/unreal-assets`; `UEShedAuthoring` provides live
editor state and mutation. The domain package does not invoke parser or transport details directly.

The implemented headless kernel includes semantic table fingerprints, persistent versioned sessions,
the five canonical command shapes, strict command folding, grouped append/undo/redo, pure inversion,
and atomic session-file replacement. Apply and Save receipts are part of the session shape even
though live dispatch is a later slice.
