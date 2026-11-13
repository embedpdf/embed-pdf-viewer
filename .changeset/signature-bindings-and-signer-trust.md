---
'@embedpdf/core-signature': minor
---

Signer trust is judged on the certificate that signed. `validateChain()`, and `validateSignatures()` through it, validated whichever certificate the CMS carried last. A signature whose own certificate led nowhere could read `trusted` when another certificate in the same CMS reached an anchor, and an expired signer could pass on the dates of its issuers. The path now starts at the signer's certificate, and a missing issuer is named in the reason.

Certificate bindings are read in every form: the SHA-1 `signing-certificate` attribute, and `signing-certificate-v2` with SHA-384 or SHA-512 beside SHA-256. A document timestamp whose token uses one of them, as OpenSSL's timestamp authority does, completes where it was refused. A signature whose binding names another certificate is `invalid` where a SHA-1 binding was ignored, and a binding with an unknown hash reads `unsupported`. A document timestamp token that binds no certificate at all is refused at completion: RFC 3161 requires the binding.

`TrustPort` takes an optional `timestampAnchors()`: the certificates trusted for timestamp authorities, apart from `anchors()`, the ones trusted for signers.
