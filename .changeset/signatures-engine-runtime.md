---
'@embedpdf/engine-runtime': minor
---

Add native and WASM APIs for signature inspection, revision comparison, byte-range digests, incremental signing, and signature-field appearances.

Make incremental layer saves omit unchanged objects and detect reverted edits, including after reopening a layer. Add file-backed layer and overlay reads, share immutable stream data, and compare stream contents in chunks to reduce copying and memory use.

Fix signature appearance placement, make newly authored form widgets printable, and resolve named pages through the current layer view.
