---
'@embedpdf/engine': patch
---

Aborting a page render now stops it in the worker, usually within a few milliseconds, instead of letting it finish first, so the renders queued behind it, such as the tiles of a page the user scrolled to, start right away.
