---
'@embedpdf/core-signature': patch
---

`webCryptoSigner`, `personalSigner`, `createTestSigner` and `createTestTimestampAuthority` import the certificate and CMS code inside the functions that need it, so an app that only configures a signer doesn't load PKI.js until someone signs.
