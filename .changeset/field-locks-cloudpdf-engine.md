---
'@cloudpdf/engine': minor
---

A form field says which signed signature locked it: `field.lockedBy` is `{ signatureIndex, source }`, or `null`. `doc.security.allowsField('fill' | 'sign', field)` answers `false` for a locked field, as the server refuses the write, and follows a signing at once. A server older than 3.5 names no lock: each of its fields reads `lockedBy: null`, in an exported bundle too.
