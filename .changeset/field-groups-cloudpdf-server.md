---
'@cloudpdf/server': minor
---

Field groups on the server:

- **Fill and sign routes** (a value, a reset, a signature look, a values import, signing) accept a token that may fill in or sign some field: `doc.forms.fill` / `doc.sign`, or a `fields:` scope. The write checks each field against the token's grants.
- **Design routes** send the grants too, for the group checks.
- **Script effects** (`form/effects`) need a filler of every field.
- **Identity:** the verified identity claim drops `groups`, and `/v1/access` no longer echoes it.
