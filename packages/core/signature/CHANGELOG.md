# @embedpdf/core-signature

## 3.1.0

## 3.0.0

### Minor Changes

- [#999](https://github.com/embedpdf/embed-pdf-viewer/pull/999) by [@bobsingor](https://github.com/bobsingor) – `validateChain(cms, trust, at?)` takes `trust: TrustPort | null`, no `undefined`.

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) – Update signature preparation and verification for the revised engine
  contracts. Preserve certificate bytes in signature results, improve timestamp
  and CMS handling, and apply document protection checks when signing or
  validating.

- [#812](https://github.com/embedpdf/embed-pdf-viewer/pull/812) by [@bobsingor](https://github.com/bobsingor) – Introduce cryptographic signing and validation helpers for PDF digital signatures. Build, parse, and verify detached CMS signatures, validate certificate chains against application-provided trust anchors, and check a signer's response before completing a signature.

  Provide WebCrypto and remote signer adapters, persistent personal signing identities, and signature verdicts that distinguish byte integrity, cryptographic validity, trust, and later document changes.

- [#1000](https://github.com/embedpdf/embed-pdf-viewer/pull/1000) by [@bobsingor](https://github.com/bobsingor) – `SignatureVerdict.validationTime` replaces `validatedAt`, which wasn't a time, and `validateSignatures()` takes `validationTime` (was `at`). Times are ISO 8601 strings: `ParsedCms.signingTime`, `BuildDetachedCmsInput.signingTime` and a timestamp `ValidationTime`'s `genTime`.

### Patch Changes

- [#997](https://github.com/embedpdf/embed-pdf-viewer/pull/997) by [@bobsingor](https://github.com/bobsingor) – Reads a signature's `contentsSizeBytes`.

- [#1003](https://github.com/embedpdf/embed-pdf-viewer/pull/1003) by [@bobsingor](https://github.com/bobsingor) – Follows engine-core: a signature is `Signature`.

- [#869](https://github.com/embedpdf/embed-pdf-viewer/pull/869) by [@bobsingor](https://github.com/bobsingor) – `webCryptoSigner`, `personalSigner`, `createTestSigner` and `createTestTimestampAuthority` import the certificate and CMS code inside the functions that need it, so an app that only configures a signer doesn't load PKI.js until someone signs.

## 3.0.0-next.23

### Minor Changes

- [#999](https://github.com/embedpdf/embed-pdf-viewer/pull/999) by [@bobsingor](https://github.com/bobsingor) – `validateChain(cms, trust, at?)` takes `trust: TrustPort | null`, no `undefined`.

- [#1000](https://github.com/embedpdf/embed-pdf-viewer/pull/1000) by [@bobsingor](https://github.com/bobsingor) – `SignatureVerdict.validationTime` replaces `validatedAt`, which wasn't a time, and `validateSignatures()` takes `validationTime` (was `at`). Times are ISO 8601 strings: `ParsedCms.signingTime`, `BuildDetachedCmsInput.signingTime` and a timestamp `ValidationTime`'s `genTime`.

### Patch Changes

- [#997](https://github.com/embedpdf/embed-pdf-viewer/pull/997) by [@bobsingor](https://github.com/bobsingor) – Reads a signature's `contentsSizeBytes`.

- [#1003](https://github.com/embedpdf/embed-pdf-viewer/pull/1003) by [@bobsingor](https://github.com/bobsingor) – Follows engine-core: a signature is `Signature`.

## 3.0.0-next.22

## 3.0.0-next.21

## 3.0.0-next.20

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
