---
'@embedpdf/engine': minor
---

Aborting a page render now stops it in the worker, usually within a few milliseconds, instead of letting it finish first, so the renders queued behind it, such as the tiles of a page the user scrolled to, start right away.

The local engine implements the revised document API for page-space geometry, object-number page references, annotation creation and transfer, form fields, signatures, metadata, and render targets. Annotation writes return the engine's confirmed record and drawing geometry.
