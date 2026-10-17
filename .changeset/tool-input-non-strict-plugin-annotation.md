---
'@embedpdf/plugin-annotation': patch
---

`AnnotationToolInput` type-checks without `strictNullChecks` too: changing a built-in tool (`{ id: 'highlight', defaults }`) and extending one (`{ id: 'approved', extends: 'free-text', … }`) were errors in plain JavaScript and in non-strict apps, because a missing `?: never` key couldn't tell the shapes apart. The keys a shape doesn't take are `?: undefined` now; strict code accepts exactly what it did.
