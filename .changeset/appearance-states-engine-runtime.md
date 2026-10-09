---
'@embedpdf/engine-runtime': minor
---

`EPDF_RenderAnnotBitmap` and `EPDF_RenderAnnotBitmapUnrotated` take a `state` argument that draws a chosen state of an appearance whatever `/AS` says (`NULL` or empty: the state `/AS` selects). New `EPDFAnnot_GetAppearanceStateCount`, `EPDFAnnot_GetAppearanceStateName` and `EPDFAnnot_GetAppearanceState` read an appearance's states and the one shown, as raw name bytes. The `EPDF_RENDER_WIDGETS` render flag draws form fields in page renders. Check box and radio button appearances draw the symbol `/MK /CA` names (check, cross, circle, diamond, square, star) in the `/DA` colour.
