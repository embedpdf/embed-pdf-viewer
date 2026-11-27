---
'@embedpdf/engine-core': minor
---

A form field says which signed signature locked it: `FormField.lockedBy` is a `FieldSignatureLock` (`{ signatureIndex, source }`, `source` being `'fieldmdp'` or `'lock'`), or `null`.

- **The one lookup.** `fieldLockRefusing(action, fieldName, protection, enforced)` gives the lock that refuses a fill or a signing of a field: a signing whatever the policy, as the runtime authors no signature into a locked field, a fill only where the engine enforces the document's signatures. `fieldSignatureLockOf()` turns a document's lock into what a field reads. `DocumentFieldLock` now extends `FieldSignatureLock`.
- **The check.** `DocumentSecurityService.allowsField('fill' | 'sign', field)` takes the field's `name` beside its group and assignment, and answers `false` for a field such a lock covers. A target without a `name`, as 3.4 callers pass, is checked as before.
- **The wire.** A named `FieldSignatureLock` component. `FormFieldDTOSchema` reads a field of a server older than `lockedBy` as locked by nothing, and `completeFormBundle()` does the same for a bundle kept from before it. `FieldSignatureLock` is in the public list both engine packages export.
- **Conformance.** `runFieldLocksConformance()` and its fixture `FIELD_LOCKS_PDF`, a sealed file whose lock leaves the locked fields not read-only, hold both engines to the rule.

A field built by hand as a `FormField` (a test fixture) needs `lockedBy`.
