---
'@cloudpdf/contract': patch
---

Share links carry `identity` (who their visitors are, for a link made for one person) on the link record, `shares.create` and `shares.update`. `Identity` is a named component, shared with `tokens.issue`, so the SDKs have one type for it.
