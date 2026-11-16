---
'@embedpdf/angular': patch
---

A production build no longer warns that `pvtsutils` is not ESM. The signature package moved to `pkijs` 4 and `asn1js` 4, which no longer use it. An `allowedCommonJsDependencies` entry for `pvtsutils` can go.
