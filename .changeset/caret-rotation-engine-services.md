---
'@embedpdf/engine-services': minor
---

Persist and render caret rotation through the engine annotation services.

- Read and write the caret `rotation` and `unrotatedRect` metadata pair during create, patch, and list operations.
- Treat caret subtype 14 as box-family when rendering annotation appearances, returning a rotation-stripped raster placed by the logical box so consumers do not double-rotate it after reload.
