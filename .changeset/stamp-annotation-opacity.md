---
'@embedpdf/engine-core': minor
'@embedpdf/engine-services': minor
'@embedpdf/core-annotation': minor
'@embedpdf/plugin-annotation': minor
---

Stamp annotations now support `/CA` opacity like every other annotation kind:
`StampAnnotationDTO` declares an `opacity` field (read from and written back to
the PDF), stamp drafts/patches accept `opacity`, the stamp kind now declares
`opacity` as an editable prop, and a stamp tool's configured default opacity is
applied when a stamp is placed (armed, click-to-place, or programmatic).
