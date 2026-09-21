---
'@embedpdf/plugin-search': patch
'@embedpdf/plugin-measurement': patch
'@embedpdf/plugin-stamp': patch
'@embedpdf/plugin-signature': patch
'@embedpdf/plugin-form': patch
'@embedpdf/plugin-annotation': patch
'@embedpdf/plugin-redaction': patch
'@embedpdf/plugin-link': patch
'@embedpdf/plugin-selection': patch
'@embedpdf/plugin-view-manager': patch
---

Follows the interaction and stage contracts (`getCurrentPage`, `reveal(ref)`, `getPageAt`, `viewportToPage`, `getActiveToolId`, `claimCursor`). Annotation's markup bridge and redaction's `queueCurrentSelection` read the selection through `getSnapshot` / `listSegments` and the `onChanged` / `onCommitted` hooks. Form, link, redaction, signature, stamp and measurement follow the annotation contract (`getRaw`/`listRaw`/`updateRaw`, `getToolDefaults`, `listPageItems`, `listLinkItems`, host priorities from `/contract/host`). Signature resolves widgets through `getFieldForWidget` / `getWidgetAt`. Signature reads stamps through `getArmedAsset`, `getLibrary` and `readAssetBytes`.
