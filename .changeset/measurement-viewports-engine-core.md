---
'@embedpdf/engine-core': minor
---

A page's layout carries its measurement viewports: `PageLayout.viewports`, left out for a page without any. A page scale is a change op, `pages.setScale { pages, measure }`, with the verb `doc.pages.setScale(pages, measure)`: one change can set the scale of many pages, and its undo puts back what each page had. The `pages.scaleSet` event and `PageScaleResult` carry `pages`, `measure` and the new `layout`; `page` stays as the first of `pages`. A pending scale change shows in the predicted page list (`viewportsWithScale`, `scaleBackOf`). The cloud layout token and manifest carry an optional `viewportsVersion`.
