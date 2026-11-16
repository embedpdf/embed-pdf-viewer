---
'@embedpdf/plugin-signature': minor
---

The signature package moves to `pkijs` 4 and `asn1js` 4, which are ES modules only. An Angular production build no longer warns that `pvtsutils` is not ESM.

In Node, `require('@embedpdf/plugin-signature')` needs Node 22.12 or newer, or 20.19 or newer on Node 20. `import` works as before. Jest in its CommonJS mode needs the libraries transformed: `transformIgnorePatterns: ['/node_modules/(?!(pkijs|asn1js|bytestreamjs|@peculiar/utils|@noble/hashes)/)']`.
