# `@ue-shed/authoring-sdk`

Browser-safe client contracts for the maintained first-party Data Authoring interface. The package
will expose scoped session reads and semantic draft intents without importing Workbench or granting
filesystem, process, raw Unreal, Apply, or Save access to a renderer.

Trusted hosts may implement this client to embed the maintained extension. This package is not an
untrusted-extension SDK, capability sandbox, custom-UI registry, or generated-interface platform.

The implemented v1 boundary exposes runtime-validated session views and atomic `set_cells` intents.
The Workbench preload transports only these scoped values: the renderer receives no session paths,
filesystem access, raw Unreal calls, Apply, or Save capability.
