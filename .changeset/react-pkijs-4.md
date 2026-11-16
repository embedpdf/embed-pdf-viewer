---
'@embedpdf/react': minor
---

In Node, `require('@embedpdf/react')` needs Node 22.12 or newer, or 20.19 or newer on Node 20: the signature package it loads moved to `pkijs` 4 and `asn1js` 4, which are ES modules only. `import` works as before, and so does a bundler.

Jest in its CommonJS mode needs those libraries transformed: `transformIgnorePatterns: ['/node_modules/(?!(pkijs|asn1js|bytestreamjs|@peculiar/utils|@noble/hashes)/)']`.
