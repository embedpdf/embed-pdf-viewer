---
'@embedpdf/angular': patch
---

A service method named `get*` or `list*` is now a read too, like `can*`, `is*` and `has*`: called in a template, a `computed()` or an `effect()`, it follows its answer, as in every adapter.

Without a document, a service method that returns a promise (`form.setValue`, `signature.placeMark`) now returns a rejected promise with `not-ready`, so `.catch()` sees it; other methods still throw.

The page context's conversions, the Stage's page layout and projector, the page view's transform and projector, the page pointer listener, the scrollbar's geometry and presses, the tool cursors, anchored UI's measuring and the settings merge now come from `@embedpdf/web` and `@embedpdf/core`, shared with every framework.
