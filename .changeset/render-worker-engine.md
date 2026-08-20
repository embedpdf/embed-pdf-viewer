---
'@embedpdf/engine': patch
---

Fix the default inline image-encoder worker path so it creates the bundled blob worker instead of attempting to fetch `/inline` and silently falling back to main-thread encoding. Tile rendering now keeps encoding work off the main thread under the default configuration.
