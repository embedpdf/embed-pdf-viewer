---
'@embedpdf/core-annotation': minor
---

`sessionHidden`, `effFlags`/`effBearer`, and the session-visibility messages are REMOVED — visibility is document truth again (`/F` flags, mutated through the normal write path), and every paint/hit/selection gate reads the annotation's own flags.
