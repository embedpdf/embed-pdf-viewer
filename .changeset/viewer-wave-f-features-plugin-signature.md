---
'@embedpdf/plugin-signature': patch
---

The signature cryptography (`@embedpdf/core-signature`, with PKI.js) loads the first time a signature is checked or a document is signed, instead of with the plugin, so an app that registers the plugin pays for it only when a document carries signatures or someone signs.
