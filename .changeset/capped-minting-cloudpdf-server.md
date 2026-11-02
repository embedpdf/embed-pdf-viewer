---
'@cloudpdf/server': minor
---

A tenant token hands out only the document permissions it holds itself. `tokens.issue` with kind `doc`, `grants.create`, and `grants.update` when it changes the scope answer `403 Forbidden` naming what the token doesn't hold. A key with `tokens.issue-doc`, `doc.open` and `doc.render` mints reading tokens and nothing more. The API token and `*` hold everything, as before.
