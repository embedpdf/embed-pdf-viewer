---
'@cloudpdf/sdk': minor
---

A form field says which signed signature locked it: `FormField.lockedBy` is a `FieldSignatureLock` (`signatureIndex`, `source`), or `null`. A server older than 3.5 leaves it out.
