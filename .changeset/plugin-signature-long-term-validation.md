---
'@embedpdf/plugin-signature': minor
---

Verdicts say whether a certificate was withdrawn and whether the file is "LTV enabled", and a signature is judged at its timestamp by default.

- Every verdict from `validate()` and `validateField()` carries `revocation` (`'good'`, `'revoked'` or `'unknown'`, with `revocationReason`) and `longTerm` (`{ enabled, at, until, documentTimestamp, missing }`), read from the answers the file holds. A signer you trust whose certificate is proven withdrawn reads `'invalid'`.
- `validate()` and `validateField()` judge each certificate at the earliest trusted timestamp that covers what it signed, and as of now when there is none. A signature whose signer's certificate expired after it was signed, and that carries a timestamp from an authority you trust, reads `'valid'` where it read `'valid-untrusted'`. Pass `validationTime: { kind: 'now' }` to judge every certificate as of now.
