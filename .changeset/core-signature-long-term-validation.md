---
'@embedpdf/core-signature': minor
---

Long-term validation, reading: `validateSignatures()` says whether a certificate was withdrawn, and whether the file holds everything to check a signature with no network.

**A signature is judged at its timestamp by default.** `validateSignatures()` judges each certificate at the earliest trusted timestamp that covers what it signed, and as of now when there is none. It is the time a reader such as Acrobat judges at, and with the answers in the file read, a certificate is not accepted on its dates alone. `validationTime: { kind: 'now' }` judges every certificate as of now; `{ kind: 'earliest-timestamp' }` names the default. No type or option changed.

- **What changes for an app that already validates:** a signature whose signer's certificate expired after it was signed, and that carries a timestamp from an authority you trust, reads `'valid'` where it read `'valid-untrusted'`.
- Judged at its timestamp, a signature reads `revocation: 'good'` from the answers stored when it was signed, and a certificate withdrawn after the timestamp does not make it `'invalid'`. Judged as of now, the same answers read `'unknown'`, and the withdrawal reads `'invalid'`.
- A signature with no timestamp you trust is judged as of now, as before.

**`revocation` on every verdict.** `'good'`, `'revoked'` or `'unknown'`: whether a certificate between the signer and your anchor was withdrawn by `validationTime`. `revocationReason` names the certificate when it isn't `'good'`. A timestamp's verdict has both too, for its authority.

- The answers come from the file and nothing is asked over a network: the document's validation data (`doc.signatures.getValidationInfo()`), the OCSP responses and CRLs a signature carries in its CMS, and Acrobat's `adbe-revocationInfoArchival` attribute. Each answer is checked by its own signature, wherever it sits.
- An answer speaks for a time. One stored at signing says the certificate was good then, so a signature judged at its timestamp reads `'good'`, and judged as of now it reads `'unknown'`. A certificate withdrawn after the timestamp reads `'good'` at the timestamp and `'revoked'` as of now.
- **`summary` is `'invalid'` when a trusted signer's certificate is proven withdrawn by the time it is judged at.** It was `'valid'` before, because nothing was checked. `'unknown'` never changes `summary`. A timestamp whose trusted authority is proven withdrawn is `'invalid'` and no longer counts as a trusted time.
- A certificate you trust as it is has nobody above it to withdraw it, so it reads `'good'`.

**`longTerm` on every verdict.** `{ enabled, at, until, documentTimestamp, missing }`, always judged at the time a timestamp proves, whatever `validationTime` is.

- `enabled` is what Acrobat calls "LTV enabled": a timestamp you trust covers the signature, the signer was trusted then, and the file holds a good answer for every certificate of the signer's path and of the timestamp authority's.
- `at` is that time, `until` the day the certificate of the last covering timestamp expires, and `documentTimestamp` the time of the last trusted document timestamp added after the signature.
- `missing` says what stands in the way, one `{ certificate, reason }` per certificate: `'no-timestamp'`, `'untrusted'`, `'no-answer'` or `'revoked'`.
- It agrees with Acrobat's "LTV enabled" line on each of the 32 signatures Acrobat judged in the repository's fixtures.

**A path may pass through the certificates the file holds.** A signature that leaves an issuer's certificate out of its CMS is `'trusted'` when the document's validation data has it.

New exported types: `LongTermVerdict`, `LongTermGap`, `LongTermGapReason`, `RevocationVerdict`.

**A test certificate authority.** `createTestCertificateAuthority()` is a throwaway authority for tests and demos. `authority.issueSigner()` gives a signer whose certificate chains to `authority.certificate` and names where to ask about it. `authority.revocation` answers those questions from memory, as a real authority answers them over HTTP: an OCSP response signed by a responder the authority certified, and a CRL. `authority.revoke(signer, { at, reason })` withdraws a certificate, and both answers say so from then on. OpenSSL verifies its answers.

**Asking an authority.** `RevocationSource` is where revocation answers come from: one method, `fetch(request)`, that returns the bytes answering a `RevocationRequest` (an OCSP request for a responder, or an address to fetch a CRL or an issuer's certificate from). `RevocationReason` names why a certificate was withdrawn.

Nothing in this package asks an authority or stores its answers in a document yet. `doc.signatures.addValidationInfo()` on the engine stores answers you already have.
