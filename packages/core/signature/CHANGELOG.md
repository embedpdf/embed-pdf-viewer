# @embedpdf/core-signature

## 3.4.0

### Patch Changes

- [#1103](https://github.com/embedpdf/embed-pdf-viewer/pull/1103) by [@bobsingor](https://github.com/bobsingor) – `createTestCertificateAuthority({ now })` dates its certificates by the clock you give it, as it dates its answers. Before, the certificates were dated by the real clock, so with a clock more than a day in the past an OCSP answer came from before the responder's certificate and read as no answer at all (`wrong-signer`).

## 3.3.0

### Minor Changes

- [#1088](https://github.com/embedpdf/embed-pdf-viewer/pull/1088) by [@bobsingor](https://github.com/bobsingor) – Long-term validation: `addValidationInfo()` keeps a signature checkable for years, and `validateSignatures()` says whether a certificate was withdrawn and whether the file holds everything to check a signature with no network.

  **`addValidationInfo(doc, { trust, revocation })`.** Once a document is signed and timestamped, it asks the certificate authorities whether each certificate was still good, checks every answer, and stores them in the file with the certificates a reader needs to follow the same paths. Acrobat then calls the signature "LTV enabled", and nobody has to be asked again.
  - It asks about each certificate between the signer and the one you trust, and the same for the timestamp's authority: the answers the file holds first, then `known` (answers and certificates you already have), then `revocation`, at the addresses the certificates name, OCSP before the issuer's list. An issuer's certificate that a signature left out is fetched from the address the certificate names, and is only ever a candidate for the path.
  - It returns `{ added, verdicts }`: how many entries of each kind it stored, and what `validateSignatures()` says about the result.
  - All or nothing: when a signature would not read as complete, nothing is stored. It throws `Network`, with the address in `details.source`, when an address didn't answer, and otherwise `SignatureRefused` with `details.reason` (`'no-timestamp'`, `'untrusted'`, `'no-answer'` or `'revoked'`), `details.certificate` and `details.field`. `partial: true` stores what there is instead.
  - `fields` covers some signatures only, and `maxCrlBytes` (1 MiB) is the largest list it stores.
  - Calling it again asks for nothing the file holds and adds nothing.

  **`httpRevocationSource({ url })`** is a `RevocationSource` for a web page, which can't ask a certificate authority itself: each question goes to a route of your own. It takes `url`, `headers`, `fetch`, `timeoutMs` and `retries`, as `httpTimestampAuthority()` does, and tries again only when no answer came.

  **`@embedpdf/core-signature/server`**, a new entry, has the routes, for any server that speaks the Fetch API:
  - `revocationRoute()` answers `httpRevocationSource()`. The addresses it is sent come from certificates, so it decides where it may go: only public `http` and `https` addresses, never a private or local one, a name that leads to one, or a redirect to either. It limits how large and how slow an answer may be, passes on only an OCSP response, a list of withdrawn certificates or a certificate, and keeps answers for as long as their authority's cache headers allow.
  - `timestampRoute({ url })` passes a timestamp request on to the authority you name, with `headers` a page must not hold.

  **`validateSignatures(doc, { trust, revocation })`** asks for the answers the file lacks and uses them for that check, without storing anything. An address that doesn't answer leaves `revocation` at `'unknown'`. `longTerm` stays about what the file holds.

  **`sign(doc, { kind: 'timestamp', key })` needs no `field`.** The engine makes a field for the document timestamp, so the last step of keeping a file checkable is one call. `result.signature.fieldName` says which field it is.

  **A signature is judged at its timestamp by default.** `validateSignatures()` judges each certificate at the earliest trusted timestamp that covers what it signed, and as of now when there is none. It is the time a reader such as Acrobat judges at, and with the answers in the file read, a certificate is not accepted on its dates alone. `validationTime: { kind: 'now' }` judges every certificate as of now; `{ kind: 'earliest-timestamp' }` names the default. The option takes what it took before.
  - **What changes for an app that already validates:** a signature whose signer's certificate expired after it was signed, and that carries a timestamp from an authority you trust, reads `'valid'` where it read `'valid-untrusted'`.
  - Judged at its timestamp, a signature reads `revocation: 'good'` from the answers stored when it was signed, and a certificate withdrawn after the timestamp does not make it `'invalid'`. Judged as of now, the same answers read `'unknown'`, and the withdrawal reads `'invalid'`.
  - A signature with no timestamp you trust is judged as of now, as before.

  **`validationTime` names a timestamp's time `stampedAt`.** `{ kind: 'timestamp', stampedAt, tokenVerified: true }`: the name the timestamp's own verdict uses, so the time a verdict reports reads the same wherever it appears.
  - `genTime`, its name until now, still works until 4.0. A verdict's `validationTime` carries the time under both names, with the same value (`AppliedValidationTime`), and the option takes either. Given both, `stampedAt` is the one used.
  - On a value you type as `ValidationTime` yourself, `genTime` is optional now. A verdict's `validationTime` always has it.

  **`revocation` on every verdict.** `'good'`, `'revoked'` or `'unknown'`: whether a certificate between the signer and your anchor was withdrawn by `validationTime`. `revocationReason` names the certificate when it isn't `'good'`. A timestamp's verdict has both too, for its authority.
  - The answers come from the file and nothing is asked over a network: the document's validation data (`doc.signatures.getValidationInfo()`), the OCSP responses and CRLs a signature carries in its CMS, and Acrobat's `adbe-revocationInfoArchival` attribute. Each answer is checked by its own signature, wherever it sits.
  - An answer speaks for a time. One stored at signing says the certificate was good then, so a signature judged at its timestamp reads `'good'`, and judged as of now it reads `'unknown'`. A certificate withdrawn after the timestamp reads `'good'` at the timestamp and `'revoked'` as of now.
  - **`summary` is `'invalid'` when a trusted signer's certificate is proven withdrawn by the time it is judged at.** It was `'valid'` before, because nothing was checked. `'unknown'` never changes `summary`. A timestamp whose trusted authority is proven withdrawn is `'invalid'` and no longer counts as a trusted time.
  - A certificate you trust as it is has nobody above it to withdraw it, so it reads `'good'`.

  **`longTerm` on every verdict.** `{ enabled, provenAt, expiresAt, documentTimestampedAt, missing }`, always judged at the time a timestamp proves, whatever `validationTime` is.
  - `enabled` is what Acrobat calls "LTV enabled": a timestamp you trust covers the signature, the signer was trusted then, and the file holds a good answer for every certificate of the signer's path and of the timestamp authority's.
  - `provenAt` is that time, `expiresAt` the day the certificate of the last covering timestamp expires, and `documentTimestampedAt` the time of the last trusted document timestamp added after the signature. Each is a point in time, named as the API names them everywhere: an ISO 8601 string ending in `At`.
  - `missing` says what stands in the way, one `{ certificate, reason }` per certificate: `'no-timestamp'`, `'untrusted'`, `'no-answer'` or `'revoked'`.
  - It agrees with Acrobat's "LTV enabled" line on each of the 32 signatures Acrobat judged in the repository's fixtures.

  **A path may pass through the certificates the file holds.** A signature that leaves an issuer's certificate out of its CMS is `'trusted'` when the document's validation data has it.

  `validateChain()`'s verdict has `withoutIssuer`: the certificate whose issuer wasn't found, when that is why a path isn't trusted.

  New exported types: `AppliedValidationTime`, `LongTermVerdict`, `LongTermGap`, `LongTermGapReason`, `RevocationVerdict`, `AddValidationInfoOptions`, `AddValidationInfoResult`, `HttpRevocationSourceOptions`, `RevocationRouteRequest`.

  **A test certificate authority.** `createTestCertificateAuthority()` is a throwaway authority for tests and demos. `authority.issueSigner()` gives a signer whose certificate chains to `authority.certificate` and names where to ask about it. `authority.revocation` answers those questions from memory, as a real authority answers them over HTTP: an OCSP response signed by a responder the authority certified, and a CRL. `authority.revoke(signer, { at, reason })` withdraws a certificate, and both answers say so from then on. OpenSSL verifies its answers.

  **Asking an authority.** `RevocationSource` is where revocation answers come from: one method, `fetch(request)`, that returns the bytes answering a `RevocationRequest` (an OCSP request for a responder, or an address to fetch a CRL or an issuer's certificate from). `RevocationReason` names why a certificate was withdrawn.

  **A document timestamp only from an authority you trust.** `sign(doc, { kind: 'timestamp', key, timestampTrust })` refuses a token from an authority `timestampTrust` doesn't cover, as it does for a signature's own timestamp, and leaves nothing signed. Before, `timestampTrust` with a document timestamp failed with `InvalidArg`.

  **Certificates that can't be withdrawn.** A signing service that issues a certificate for one signature, valid for minutes, runs no revocation service for it, and the certificate says so in an extension: "validity assured, short term" (ETSI EN 319 412-1) or `noRevAvail` (RFC 9608). Such a certificate needs no answer: `revocation` reads `'good'` when the certificates above it do, `longTerm` counts nothing as missing for it, and `addValidationInfo()` asks nobody about it. The extension counts on a certificate that issues nothing, and `noRevAvail` doesn't count beside an address to ask at. `createTestCertificateAuthority()`'s `issueSigner({ unrevocable })` issues one, with `'validity-assured'` or `'no-rev-avail'` (`Unrevocable`).

- [#1092](https://github.com/embedpdf/embed-pdf-viewer/pull/1092) by [@bobsingor](https://github.com/bobsingor) – `pkijs` 4 and `asn1js` 4. Both are ES modules only and no longer use `pvtsutils`, the one CommonJS module this package brought along. An Angular production build no longer warns that `pvtsutils` is not ESM, and an `allowedCommonJsDependencies` entry for it can go.

  **CommonJS works as before.** `require()` does not load an ES module on every Node, or in Jest, so the CommonJS files of this package hold the two libraries and the three they use.
  - `require('@embedpdf/core-signature')` loads no ES module, and neither does a package that loads it. Jest in its CommonJS mode needs no configuration.
  - The type declarations for CommonJS hold the libraries' types, so TypeScript that compiles to CommonJS reads them with any `module` setting.
  - `dist/THIRD-PARTY-NOTICES.txt` lists what the files hold, with each version and license, and `inlinedDependencies` in `package.json` has the versions.
  - The CommonJS files are about 930 kB, where they were 180 kB. The ES module files import the libraries as before.

  **In Node, the two libraries ask for Node 22.12 or newer, or 20.19 or newer on Node 20.** npm warns when it installs them on an older one.

  **A time from 2050 on is written as GeneralizedTime.** A signing time (`subFilter: 'adbe.pkcs7.detached'`), and the dates of the certificates and revocation lists this package makes, were always written as UTCTime, which ends with the year 2049: a signing time in 2050 was written as 1950. RFC 5652 and RFC 5280 have a later time as GeneralizedTime. Times are written to the second.

- [#1087](https://github.com/embedpdf/embed-pdf-viewer/pull/1087) by [@bobsingor](https://github.com/bobsingor) – Signature timestamps (PAdES B-T): a signature can carry an RFC 3161 token from a timestamp authority, and a reader says what that token is worth.

  **Signing.** `sign()` takes `timestampAuthority`: the signature then carries a timestamp from that authority, stored inside the signature. A timestamp that can't be had fails the signing, so nothing is signed without it. `timestampTrust` refuses a token from an authority that trust port doesn't cover. With a `timestampAuthority`, `sign()` reserves 16384 bytes for the signature unless `contentsSizeBytes` says otherwise. `httpTimestampAuthority({ url })` is an authority reached over HTTP, for a signature's timestamp and for a document timestamp. It tries again only when no answer came, and every error it raises carries the authority's address in `details.authority`.

  **Two steps.** `completeSignature(doc, { prepared, cms })` is the second half of `sign()`: it checks the CMS against what was prepared, adds the timestamp when asked, and completes. A failure leaves the signing prepared. `attachSignatureTimestamp({ cms, authority })` adds a timestamp to a finished CMS and leaves every other byte of it as it was, also for a CMS written with indefinite lengths.

  **Reading.** `validateSignatures()` reports each signature's timestamp in `verdict.timestamp`: whether the token checks out and stamps this signature, whether its authority is trusted and made for timestamping, the time it vouches for, and the authority's name. It never changes the signature's `summary`. A document timestamp reads back with a real verdict, where it read `indeterminate`. `validationTime: { kind: 'earliest-timestamp' }` judges each certificate at the earliest trusted timestamp that covers what it signed, and now when there is none. `verifyTimestampToken()` checks a token over any digest.

  **Trust.** `TrustPort` takes an optional `timestampAnchors()`: the certificates trusted for timestamp authorities, apart from `anchors()`, the ones trusted for signers. Signer trust is judged on the certificate that signed: `validateChain()`, and `validateSignatures()` through it, validated whichever certificate the CMS carried last, so a signature whose own certificate led nowhere could read `trusted` when another certificate in the same CMS reached an anchor, and an expired signer could pass on the dates of its issuers. A missing issuer is named in the reason.

  **Checks that changed.** Certificate bindings are read in every form: the SHA-1 `signing-certificate` attribute, and `signing-certificate-v2` with SHA-384 or SHA-512 beside SHA-256. A document timestamp whose token uses one of them completes where it was refused; a signature whose binding names another certificate is `invalid` where a SHA-1 binding was ignored; a binding with an unknown hash reads `unsupported`. A document timestamp token that binds no certificate at all is refused at completion. The completion gate checks a timestamp a CMS already carries: one that provably stamps something other than the signature is refused. When a signature doesn't fit the room reserved for it, the refusal names the `contentsSizeBytes` to prepare with.

  **Also.** A CMS key may declare a `hash`, which `sign()` takes as its default digest. `ecdsaRawFromDer()` turns the DER ECDSA signature most signing services return into the `r || s` a raw key returns. `createTestTimestampAuthority()` signs with a certificate made for a timestamp authority, so validators such as OpenSSL accept its tokens.

### Patch Changes

- [#1094](https://github.com/embedpdf/embed-pdf-viewer/pull/1094) by [@bobsingor](https://github.com/bobsingor) – The serial number of a certificate or a timestamp token this package makes is always DER. It was eight random bytes with only the top bit cleared, so about one in 256 began with a zero byte that DER leaves out, and a strict reader refused it: OpenSSL can't decode such a certificate. `personalSigner()`, `createTestSigner()` and `createTestTimestampAuthority()` made them that way.

  A certificate that a personal key store already holds keeps the serial number it has. `store.remove(subject)` has the next `personalSigner()` make a new one.

- [#1090](https://github.com/embedpdf/embed-pdf-viewer/pull/1090) by [@bobsingor](https://github.com/bobsingor) – A PKCS#7 signature's signed attributes are in DER order. `sign(doc, { subFilter: 'adbe.pkcs7.detached' })` wrote its signed attributes, and signed them, in the order content type, message digest, signing time. DER puts the signing time before the message digest, and RFC 5652 has the signature made over the attributes in DER. They are now sorted before they are signed, so a reader that encodes them again before it checks the signature gets the bytes that were signed.
  - The default, `'ETSI.CAdES.detached'`, was in DER order already, and so was the test timestamp authority's token.
  - A signature made before still verifies here: it is checked over the order it was written in.

## 3.2.0

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
