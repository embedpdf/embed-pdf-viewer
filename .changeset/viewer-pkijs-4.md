---
'@embedpdf/viewer': patch
---

An Angular production build of an app with the viewer no longer warns that `pvtsutils` is not ESM. The signature package moved to `pkijs` 4 and `asn1js` 4, which no longer use it. An `allowedCommonJsDependencies` entry for `pvtsutils` can go.
