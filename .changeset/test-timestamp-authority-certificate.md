---
'@embedpdf/core-signature': patch
---

`createTestTimestampAuthority()` signs with a certificate made for a timestamp authority. Timestamping is its only purpose, in a critical extended key usage, and its key usage is `digitalSignature` alone, so validators such as OpenSSL accept its tokens. It used a signer's certificate before, which carries no purpose.
