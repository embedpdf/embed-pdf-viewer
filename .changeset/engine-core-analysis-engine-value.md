---
'@embedpdf/engine-core': minor
---

An analysis URL names the server's `analysis` engine value, and no policy number.

- `encodeAnalysisToken()` no longer writes `policy`, and `decodeAnalysisToken()` reads past one. `AnalysisToken.policyVersion` is deprecated and ignored; it goes in 4.0.
- `analysisQueryString()` no longer writes `policy`. It takes `engine`, the server's `analysis` value, and writes it as a query parameter.
- `VersionAnalysisQuerySchema` has `engine` in place of `policy`.
- `wirePaths.layerVersionSignatures()` takes `engine`, the server's `signatures` value, and writes it as a query parameter. `VersionSignaturesQuerySchema` is its query.

`SIGNATURE_POLICY_VERSION` and `policyVersion` on an analysis are as they were.
