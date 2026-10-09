---
'@embedpdf/angular': minor
---

The page's layers say what they paint:

- **`<epdf-render-layer>`** leaves out of the page picture what a layer on the page paints: the annotations while `<epdf-annotation-layer>` is there, the form fields while `<epdf-form-layer>` is. Its `annotations` and `formFields` inputs decide for themselves when set; left out, a part no layer paints is drawn when the user may read it. Setting `annotations` to `false` next to an annotation layer is no longer needed.
- **`<epdf-form-layer>`** paints each field at rest as the engine draws it, in the state it shows, with the controls above while the tool fills forms. Hidden widgets get neither.
- `canFill` and the signature checks take the field.
- **Runtime:** `paintsPagePart()` and `injectPaintedParts()` replace `publishPageLayerFact()` and `PageLayerFacts`.
