---
'@embedpdf/core-signature': minor
---

Long-term validation, first part: a certificate authority to test against, and the types for asking one whether a certificate was withdrawn.

**A test certificate authority.** `createTestCertificateAuthority()` is a throwaway authority for tests and demos. `authority.issueSigner()` gives a signer whose certificate chains to `authority.certificate` and names where to ask about it. `authority.revocation` answers those questions from memory, as a real authority answers them over HTTP: an OCSP response signed by a responder the authority certified, and a CRL. `authority.revoke(signer, { at, reason })` withdraws a certificate, and both answers say so from then on. OpenSSL verifies its answers.

**Asking an authority.** `RevocationSource` is where revocation answers come from: one method, `fetch(request)`, that returns the bytes answering a `RevocationRequest` (an OCSP request for a responder, or an address to fetch a CRL or an issuer's certificate from). `RevocationReason` names why a certificate was withdrawn.

Nothing reads or stores these answers in a document yet.
