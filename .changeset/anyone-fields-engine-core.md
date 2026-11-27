---
'@embedpdf/engine-core': minor
---

A form field can be one anyone fills in: `FormField.forAnyone`, and `forAnyone` in a `FormFieldDraft` and a `FormFieldPatch`. Every user who may fill in some field may fill in such a field, whatever group their permission names; a user who may fill in no field still can't, and a group's permission still doesn't reach the sender's fields (a field in no group that isn't `forAnyone`).

- **The checks.** `checkFieldAction()`, `allowsFieldWrite()` and `authorizeFieldWrite()` take the field itself (a `FieldAssignment`: `{ groupId, forAnyone? }`, which a `FormField` is) beside its group id alone, and `DocumentSecurityService.allowsField('fill' | 'sign', field)` takes a `FieldAssignment`. A field that is `forAnyone` takes any fill right: `doc.forms.fill`, `fields:fill:all` or a `fields:fill:group=…`.
- **Marking one** takes `fields:set-group:all`, since it reaches every group: `authorizeForAnyone()`. `false` takes no right of its own. `fieldRights().setGroup` is `{ all: true }` exactly when a user may mark one.
- **One or the other.** A field is in a group or `forAnyone`, never both, so in an update setting one replaces the other: `forAnyone: true` takes the field out of its group, and a group takes `forAnyone` away. `groupId: null` and `forAnyone: false` each take away only their own. `assignmentAfter()` works out the group and `forAnyone` an update leaves, and `checkedForAnyone()` a draft's; both refuse a group with `forAnyone: true`, and `forAnyone: true` on a signature field, with `InvalidArg` (`details.field: 'forAnyone'`), as the engine does.
- **Prediction.** `formFieldOfDraft()` and `formFieldAfter()` give `forAnyone`, and the group an update leaves, as the engine reads them back.
- **The wire.** `FormFieldDTOSchema` reads a field of a server older than `forAnyone` as `forAnyone: false`, and `completeFormBundle()` does the same for a bundle kept from before it. `ANYONE_FIELDS_SINCE` (`'3.5'`) is the version it arrives in on the wire.
- **Conformance.** `runAnyoneFieldsConformance()` and its fixture `ANYONE_FIELDS_PDF` hold both engines to the rule, the lock included.

A field built by hand as a `FormField` (a test fixture) needs `forAnyone`.
