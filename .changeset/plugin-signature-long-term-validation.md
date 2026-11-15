---
'@embedpdf/plugin-signature': minor
---

Verdicts say whether a certificate was withdrawn and whether the file is "LTV enabled", and a signature is judged at its timestamp by default.

- Every verdict from `validate()` and `validateField()` carries `revocation` (`'good'`, `'revoked'` or `'unknown'`, with `revocationReason`) and `longTerm` (`{ enabled, provenAt, expiresAt, documentTimestampedAt, missing }`), read from the answers the file holds. A signer you trust whose certificate is proven withdrawn reads `'invalid'`.
- `validate()` and `validateField()` judge each certificate at the earliest trusted timestamp that covers what it signed, and as of now when there is none. A signature whose signer's certificate expired after it was signed, and that carries a timestamp from an authority you trust, reads `'valid'` where it read `'valid-untrusted'`. Pass `validationTime: { kind: 'now' }` to judge every certificate as of now.
- A verdict's `validationTime` names a timestamp's time `stampedAt`. `genTime`, its name until now, is there beside it and is still taken by `validate()`, until 4.0. `AppliedValidationTime`, the type of what a verdict reports, comes with the plugin's exports.

**Signatures that stay checkable.** Two settings and two methods keep what the plugin seals checkable with no network.

- `revocation` is where revocation answers come from, such as `httpRevocationSource({ url })`. With it, every signature the plugin seals gets its validation data right after: the answers that say its certificates were good at its timestamp, stored in the file. It needs `trust`. `documentTimestamp: true` then adds a document timestamp from `timestampAuthority`.
- The signature is sealed first, so a failure afterwards can't undo it. `sign()`, `completeSignature()` and `placeMark()` still resolve, and the result says what happened: `validationInfo` is `{ added, documentTimestamp }`, or `null` when nothing was to be added, and `validationInfoError` is the error that kept the data or the document timestamp out, or `null`.
- Only the signature just made is covered. A session without `doc.sign`, such as a signer of one group's fields, signs without the follow-up.
- `addValidationInfo(field?)` does the same for a signed field, or for every signature, and rejects when one can't be covered. `canAddValidationInfo()` says whether it can: the `revocation` and `trust` settings, and `doc.sign`.
- The verdicts are read again when anyone adds validation data to the document. Checking asks nobody: only what the file holds counts.
- `httpRevocationSource` and `createTestCertificateAuthority` come with the plugin's exports, beside the signers.
