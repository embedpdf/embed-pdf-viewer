---
'@embedpdf/plugin-render': minor
---

Pictures by family, and the form fields' own pictures:

- **What a picture draws:** `includeFormFields` next to `includeAnnotations` (`PageLayerOptions`), on `renderPage`, `renderThumbnail` and the layers' doors. An option left out draws what the user may read, so a token that may render but not read annotations gets its pictures; asking for what the user may not read is refused.
- **Keys and redraws per family:** each picture is cached and redrawn by what it draws. Annotation changes redraw pictures with annotations, form changes (`forms.*`, signings) pictures with fields. `invalidate()` takes `scope: 'fields'`, and `getRenderEpoch(page, layers?)` takes the options.
- **Field pictures for the form layer:** `renderFieldAppearances(page, { scale })`, every widget in every state, shared between the views that paint them, with `getFieldAppearanceEpoch(page)` and `getAppearanceScale(renderScale)`.
- **For the layers:** `getLayerRights()`, what the user may read of each part.
- A reorder (`annotations.reordered`) redraws the page again.
