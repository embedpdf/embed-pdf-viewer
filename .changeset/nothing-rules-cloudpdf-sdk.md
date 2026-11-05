---
'@cloudpdf/sdk': minor
---

A destination's `x`, `y` and `zoom` are always there, `null` to keep the viewer's value, and a document's `openDestination` is always there. A line's `captionEnabled` is a boolean, never `null`. A grant create takes `null` for `origins` and `expiresAt`, as a grant read says them.
