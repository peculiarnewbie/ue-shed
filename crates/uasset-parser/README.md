# `uasset-parser`

The native saved-package parser for UE Shed. It provides the `uasset` Rust library and CLI used by
`@ue-shed/unreal-assets` for editor-free `inspect` and `authoring` operations.

The parser remains behind a versioned JSON process boundary. TypeScript packages consume that
contract rather than Rust implementation details, and the crate has no Workbench dependency.

This code was extracted from the pre-publication `ue-parser` development repository after UAsset
and UTrace grew into separate products. UTrace parsing, dashboards, WASM, and browser code are
intentionally not part of this crate. The extracted parser code retains its MIT license.

Build the CLI from the repository root:

```text
cargo build --release -p uasset-parser
```

The executable is written to `target/release/uasset` (`uasset.exe` on Windows).
