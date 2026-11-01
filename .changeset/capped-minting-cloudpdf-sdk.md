---
'@cloudpdf/sdk': patch
---

`tokens.issue` and `grants.create` say that a tenant token gives only document permissions it holds itself, and `grants.update` can answer `403`.
