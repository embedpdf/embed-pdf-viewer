---
'@cloudpdf/contract': minor
---

A form field says which signed signature locked it: `FormField.lockedBy` is a `FieldSignatureLock` component (`signatureIndex`, and `source`: `fieldmdp` or `lock`), or `null`. It arrives in 3.5; an older server leaves it out.
