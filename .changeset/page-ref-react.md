---
'@embedpdf/react': minor
---

The page context exposes `ref: PageRef` (identity-stable per page) instead of `pon`; `usePageList()` entries carry `ref`, selection and annotation anchors carry `page`, and `usePageScale` accepts a `PageRef` or `null`.
