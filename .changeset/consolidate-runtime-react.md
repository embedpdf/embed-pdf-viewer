---
'@embedpdf/react': patch
---

The page context, the Stage's page layout and projector, the page view's transform, the page pointer listener, the scrollbar's geometry and presses, the tool cursors and anchored UI's measuring now come from `@embedpdf/web`, and the no-document stand-in and the viewer's settings from `@embedpdf/core`, shared with every framework; nothing changes in how they behave. `makePageContext` and `PageContextValue` are the shared ones.

Without a document, a method that returns a promise (`useForm().setValue`, `useRedaction().markPage`) now returns a rejected promise with `not-ready`, so `.catch()` sees it; other methods still throw.
