# `@ue-shed/host`

Composes UE Shed's trusted, UI-agnostic Data Authoring capabilities for embedding hosts.

`ShedHostLive` provides the asset reader, Remote Control client, authoring catalog and sessions,
`ShedAuthoring`, and the direct browser-safe `AuthoringClient`. The embedding runtime supplies:

- `ShedHostConfiguration` for project, asset, reader, and Remote Control settings;
- `AuthoringFilePicker` when interactive asset selection is supported;
- observability, runtime execution, process exits, and any browser transport.

Electron and Workbench types are deliberately absent. Workbench adapts its configuration and dialog
services to these ports; a non-Electron composition is demonstrated by the
[headless authoring example](../../examples/authoring-headless/README.md).

The package does not grant a browser filesystem or Unreal authority. Browser renderers consume the
`AuthoringClient` contract from `@ue-shed/authoring-sdk`; a host may provide the direct client
in-process or bridge that contract over its chosen transport.
