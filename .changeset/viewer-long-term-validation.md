---
'@embedpdf/viewer': minor
---

`plugins.signature.revocation` keeps every signature the viewer seals checkable with no network: its validation data is stored in the file right after the seal. `plugins.signature.documentTimestamp` adds a document timestamp after it. `httpRevocationSource` and `createTestCertificateAuthority` are exported beside the signers.
