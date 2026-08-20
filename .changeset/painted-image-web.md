---
'@embedpdf/web': minor
---

Add `bindPaintedImage`, a framework-neutral browser adapter for binding object-URL raster sources to image elements. It hides incomplete images, owns abort and URL-revocation cleanup, and reports painted and unpainted state around the image's presented lifetime so React, Vue, Svelte, and Angular adapters can share the same minimal lifecycle.
