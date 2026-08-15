---
'@embedpdf/engine-core': minor
---

Extend the caret annotation contract with box-family rotation metadata.

Caret DTOs, drafts, patches, and schemas now carry optional `rotation` and `unrotatedRect` fields with the same tri-state semantics as other box-family annotations. Rotation-stripped appearance documentation now includes carets.
