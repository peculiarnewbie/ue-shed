# Authoring catalog

`@ue-shed/authoring-catalog` is the public saved/live DataTable discovery service. It composes the
saved-package reader and an optional live Unreal connection, preserves authority-specific schema and
fingerprint evidence, and reports identity divergence without hiding either source.

The package is headless and has no Workbench dependency. Use `discoverAuthoringProjectCatalog` from
another host or `ue-shed authoring catalog` from the CLI.
