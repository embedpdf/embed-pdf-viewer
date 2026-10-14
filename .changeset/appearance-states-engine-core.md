---
'@embedpdf/engine-core': minor
---

Appearance images now come with every look an annotation has. `renderAppearances()` returns each mode the annotation stores (at rest, under the pointer, pressed) and every state of each mode (a check box's `Off` and its on state), each image labelled with `mode` and the new `state`. `modes` is now a filter on both engines, defaulting to every mode; an empty list is refused with `InvalidArg`. Annotations gain `appearanceState` (their `/AS`), and the new `shownAppearances(appearances, annotations)` picks each annotation's look at rest in the state it shows. Page renders gain `includeFormFields`, which defaults to `includeAnnotations`, so a page rendered with its annotations now shows its filled form fields.
