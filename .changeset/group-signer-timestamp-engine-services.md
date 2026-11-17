---
'@embedpdf/engine-services': patch
---

Let a signer whose signing is limited to a group add a document timestamp when they hold `doc.sign`. A document timestamp names no field, so it is the document's to sign, but it was checked as a field in no group: with any `fields:sign` permission in the scope it failed with `permission denied (target): doc.sign`, also when the scope had `doc.sign`. The validation data was stored and the timestamp after it was refused. Signing fields stays as narrow as before: `doc.sign` beside a `fields:sign` permission signs no field in another group or in none.
