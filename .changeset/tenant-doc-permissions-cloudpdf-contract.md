---
'@cloudpdf/contract': minor
---

Document operations accept tenant JWTs, which need the operation's document
capabilities exactly as a document JWT does; no tenant scope reaches inside a
document. A tenant token's `scope` now takes document capabilities next to
tenant scopes, and they hold for every document of the tenant.
`documents.download` needs `doc.download` and `documents.thumbnail` needs
`doc.render` instead of `docs.read`. `docs.update` renames and moves, and never
changes content.
