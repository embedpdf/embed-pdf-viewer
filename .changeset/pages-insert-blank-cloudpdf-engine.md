---
'@cloudpdf/engine': minor
---

Implement page insertion, blank-page creation, and page extraction in the
cloud document pages service. Insertions invalidate stale manifest rows and
publish local or realtime `pages.inserted` events with the updated layout.
