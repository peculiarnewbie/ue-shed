# `@ue-shed/unreal-connection`

Owns stock Remote Control connectivity, companion transport negotiation, reconnect behavior, and
bounded data-plane channels. It depends on protocol contracts, not domain UIs.

The first implemented adapter negotiates `UEShedCore` over Remote Control HTTP and exposes the
authoring snapshot, Apply, operation lookup, and Save capabilities as typed Effect operations. Every
HTTP envelope and nested companion JSON result is runtime-validated. Calls have explicit timeouts,
typed retry guidance, and structured spans.
