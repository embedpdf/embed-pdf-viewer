---
'@embedpdf/core': minor
---

Plugins ask about form fields one at a time: `ctx.allowsField('fill' | 'sign', field)` and `ctx.assertAllowedField(action, field, operation)`, which refuses with `permission-denied` naming what it would take (`fields:fill:group=buyer`). `resolvePageLayers` and the `PageLayerRights`, `PageRenderLayers` and `AnnotationAppearanceImage` types come from `@embedpdf/core`.
