---
'@embedpdf/angular': minor
---

Follows the documents, interaction and stage contracts: `injectDocuments` exposes the renamed document operations and a readonly `docs` signal; the stage facades read through `getSettings` and the page registry (`injectPages().pageCount`, `injectPageList().pages` come from `documents.listPages`); `<epdf-stage>` binds the host lens; the actions adapter navigates with `goToPageIndex`. `<epdf-render-layer>` binds the render host lens (`renderSource`, `getSourceKey`).
