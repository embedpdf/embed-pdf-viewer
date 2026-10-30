# @embedpdf/core-signature

## 3.0.0-next.19

## 3.0.0-next.18

## 3.0.0-next.17

## 3.0.0-next.16

## 3.0.0-next.15

### Minor Changes

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) – Update signature preparation and verification for the revised engine
  contracts. Preserve certificate bytes in signature results, improve timestamp
  and CMS handling, and apply document protection checks when signing or
  validating.

### Patch Changes

- [#869](https://github.com/embedpdf/embed-pdf-viewer/pull/869) by [@bobsingor](https://github.com/bobsingor) – `webCryptoSigner`, `personalSigner`, `createTestSigner` and `createTestTimestampAuthority` import the certificate and CMS code inside the functions that need it, so an app that only configures a signer doesn't load PKI.js until someone signs.

## 3.0.0-next.14

## 3.0.0-next.13

### Minor Changes

- [#812](https://github.com/embedpdf/embed-pdf-viewer/pull/812) by [@bobsingor](https://github.com/bobsingor) – Introduce cryptographic signing and validation helpers for PDF digital signatures. Build, parse, and verify detached CMS signatures, validate certificate chains against application-provided trust anchors, and check a signer's response before completing a signature.

  Provide WebCrypto and remote signer adapters, persistent personal signing identities, and signature verdicts that distinguish byte integrity, cryptographic validity, trust, and later document changes.
