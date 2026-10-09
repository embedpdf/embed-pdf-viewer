---
'@embedpdf/vue': patch
---

A read on a plugin's API now updates where it's called: a method named `get*`, `list*`, `is*`, `has*` or `can*` called in a template, a `computed` or a `watchEffect` follows its answer (`v-if="annotation.canCreate()"`), and every other method tracks nothing, as in every adapter.

Without a document, a method that returns a promise (`form.setValue`, `redaction.markPage`) now returns a rejected promise with `not-ready`, so `.catch()` sees it; other methods still throw.

The page context, the Stage's page layout and projector, the page view's transform, the page pointer listener, the scrollbar's geometry and presses, the tool cursors, anchored UI's measuring and the tile demand comparison now come from `@embedpdf/web`, `@embedpdf/core` and the plugins, shared with every framework.
