---
'@embedpdf/engine': minor
---

A form field says which signed signature locked it: `field.lockedBy` is `{ signatureIndex, source }`, or `null`, whether or not the field is marked read-only. `doc.security.allowsField('fill', field)` now answers `false` for such a field, as a write fails with `ProtectedDocument`, and `allowsField('sign', field)` for a locked signature field, which can't be signed. Both follow a signing in the same session at once, also for a field read before it.

Under `signedDocumentPolicy: 'permit'`, a field still names its lock and `allowsField('fill', field)` answers `true`; a locked signature field still can't be signed, so `allowsField('sign', field)` stays `false`. An app that passed `allowsField()` the whole field gets the new answer; one that passed only `{ groupId }` gets the old one.
