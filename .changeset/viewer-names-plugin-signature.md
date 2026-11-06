---
'@embedpdf/plugin-signature': minor
---

`refresh()` resolves nothing, as every plugin's does. The signing key is `signingKey` (setting and `sign()` option) and its type `SigningKey` (were `key` and `SignatureKey`: in naming.md a key is a lookup key). `PlaceMarkResult` is tagged `status`, as every call result is (was `kind`). `validate()` takes `validationTime` (was `at`).
