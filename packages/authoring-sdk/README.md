# `@ue-shed/authoring-sdk`

Browser-safe client contracts for the maintained first-party Data Authoring interface. The package
will expose scoped session reads and semantic draft intents without importing Workbench or granting
filesystem, process, raw Unreal, Apply, or Save access to a renderer.

Trusted hosts may implement this client to embed the maintained extension. This package is not an
untrusted-extension SDK, capability sandbox, custom-UI registry, or generated-interface platform.

The package remains a boundary placeholder until Plan 004 implements the persistent authoring session
service and its host-neutral client.
