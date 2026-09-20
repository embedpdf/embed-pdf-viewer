# @embedpdf/core-signature

## 3.0.0-next.13

### Minor Changes

- [#812](https://github.com/embedpdf/embed-pdf-viewer/pull/812) by [@bobsingor](https://github.com/bobsingor) – Introduce cryptographic signing and validation helpers for PDF digital signatures. Build, parse, and verify detached CMS signatures, validate certificate chains against application-provided trust anchors, and check a signer's response before completing a signature.

  Provide WebCrypto and remote signer adapters, persistent personal signing identities, and signature verdicts that distinguish byte integrity, cryptographic validity, trust, and later document changes.
