# Unreal editor play-session contract v1

These JSON Schemas are the language-neutral authority for observing and controlling a local Unreal
Editor play session. Commands are idempotent and return the state observed immediately after the
request. Lifecycle completion remains observable through subsequent state queries.

`play` means Play In Editor and `simulate` means Simulate In Editor. Version 1 targets one local,
single-process session in the active level viewport. Standalone and multiplayer launch profiles are
outside this contract.

The JSON fixtures are shared examples for TypeScript and Unreal-side conformance tests.
