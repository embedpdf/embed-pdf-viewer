---
'@embedpdf/core-signature': minor
---

`validateSignatures()` reports each signature's timestamp in `verdict.timestamp`: whether the token checks out and stamps this signature, whether its authority is one of your `timestampAnchors` and made for timestamping, and the time it vouches for. It is `null` when the signature carries none, and it never changes the signature's `summary`.

A document timestamp reads back with a real verdict, where it read `indeterminate`: `integrity` says whether the file it stamped is intact, `cryptography` and `trust` are its token's, and `timestamp` holds the same verdict a signature's timestamp gets.

`validationTime: { kind: 'earliest-timestamp' }` judges each certificate at the earliest trusted timestamp that covers what it signed: a signer's at its signature's own timestamp or at a document timestamp added later, a timestamp authority's at a document timestamp added later, and now when there is none. The default stays now. It looks at dates only: revocation is not checked.

`verifyTimestampToken({ token, digest, algorithm, trust })` checks a token over any digest, such as the daily hash of an audit log, and returns the same verdict.
