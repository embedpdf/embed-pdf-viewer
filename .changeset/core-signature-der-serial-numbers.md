---
'@embedpdf/core-signature': patch
---

The serial number of a certificate or a timestamp token this package makes is always DER. It was eight random bytes with only the top bit cleared, so about one in 256 began with a zero byte that DER leaves out, and a strict reader refused it: OpenSSL can't decode such a certificate. `personalSigner()`, `createTestSigner()` and `createTestTimestampAuthority()` made them that way.

A certificate that a personal key store already holds keeps the serial number it has. `store.remove(subject)` has the next `personalSigner()` make a new one.
