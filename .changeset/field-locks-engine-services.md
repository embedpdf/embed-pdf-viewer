---
'@embedpdf/engine-services': minor
---

Every form field read says which signed signature locked it (`lockedBy`), from the same lookup a write refuses a locked field by, whether or not the field is marked read-only. The lookup is read once for each version of the document and doesn't depend on the policy: under `signedDocumentPolicy: 'permit'` a field still names its lock, while writes go through. `readFieldAt()` and `readFormFields()` take the lookup (`fieldLocksOf()`), `null` where none is known.
