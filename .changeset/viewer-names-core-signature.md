---
'@embedpdf/core-signature': minor
---

`SignatureVerdict.validationTime` replaces `validatedAt`, which wasn't a time, and `validateSignatures()` takes `validationTime` (was `at`). Times are ISO 8601 strings: `ParsedCms.signingTime`, `BuildDetachedCmsInput.signingTime` and a timestamp `ValidationTime`'s `genTime`.
