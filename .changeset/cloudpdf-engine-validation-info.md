---
'@cloudpdf/engine': minor
---

Long-term validation works on the cloud engine.

- `doc.signatures.getValidationInfo()` reads the validation data the layer's file holds, pinned at the document version like the signature list. `doc.signatures.addValidationInfo()` stores more through a route of its own, publishes `signatures.validationInfoAdded`, and everyone else with the layer open receives the same event. So `addValidationInfo()` from `@embedpdf/core-signature` runs over the cloud engine as it does locally: the app collects the answers and the server stores them.
- A document timestamp needs no `field`: `sign(doc, { kind: 'timestamp', key })` and `prepare({ kind: 'timestamp' })` work, and the server makes the field.
- All three need a server of version 3.3. An older one is never sent them: they fail with `NotImplemented`, with `details.needs` and `details.serverVersion`. Checking signatures against an older server still works.
