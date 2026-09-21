---
'@embedpdf/viewer-chrome': patch
---

Follows the documents, interaction and stage contracts (`documents.save`, `getActiveToolId`, `getCurrentPage`, `revealIndex`, `rotateViewBy`, `getSettings`); page controls count pages from the page registry. Annotation UI reads the page-space records (`listSelected`, `raw` for engine-only fields), the comments panel uses the renamed comment verbs and `useAnnotationStatus`. Widget deletion resolves fields through `getFieldForWidget` and deletes by ref; the signature inspector reads the fill feed through `FormHostToken`. Stamp and signature panels use the renamed stamp verbs; library export is asynchronous. `ViewerHandle` gains `on(event, listener)` over the document lifecycle events (`opened`, `openFailed`, `locked`, `closed`, `activeChanged`, `pagesChanged`).
