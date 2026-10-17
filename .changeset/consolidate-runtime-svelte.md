---
'@embedpdf/svelte': patch
---

Without a document, a method that returns a promise (`form.setValue`, `redaction.markPage`) now returns a rejected promise with `not-ready`, so `.catch()` sees it; other methods still throw.

The page context, the Stage's page layout and projector, the page view's transform, the page pointer listener, the scrollbar's geometry and presses, the tool cursors, anchored UI's measuring and the no-document stand-in now come from `@embedpdf/web` and `@embedpdf/core`, shared with every framework.
