---
'@embedpdf/core-signature': patch
---

`createTestCertificateAuthority({ now })` dates its certificates by the clock you give it, as it dates its answers. Before, the certificates were dated by the real clock, so with a clock more than a day in the past an OCSP answer came from before the responder's certificate and read as no answer at all (`wrong-signer`).
