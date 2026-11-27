---
'@embedpdf/engine-core': minor
---

Who fills a form field in is one fact, `FormField.assignment`: one group's signers (`{ kind: 'group', groupId }`), anyone (`{ kind: 'anyone' }`), or no one in particular (`{ kind: 'unassigned' }`). Every user who may fill in some field may fill in a field anyone fills in, whatever group their permission names; a user who may fill in no field still can't, and a group's permission still doesn't reach an unassigned field.

- **The type.** `FieldAssignment` is the union. `FormField.groupId` stays, and reads the group's id, or `null` for anyone and unassigned.
- **Writes.** `FormFieldDraft` and `FormFieldPatch` take `assignment` beside `groupId`, its shorthand: a group id for that group, `null` for unassigned. Either works from any assignment; both in one write, or `{ kind: 'anyone' }` on a signature field, is refused with `InvalidArg` (`details.field: 'assignment'`). `draftAssignment()` and `assignmentAfter()` work out what a create and an update leave, as the engine does; `assignmentOfGroup()`, `groupIdOfAssignment()` and `assignmentsEqual()` go between an assignment and a group id.
- **The checks.** `checkFieldAction()`, `allowsFieldWrite()` and `authorizeFieldWrite()` take a `FieldAssignment` beside a group id alone, and `DocumentSecurityService.allowsField('fill' | 'sign', field)` reads the field's `assignment`, else its `groupId`. A field anyone fills in takes any fill right: `doc.forms.fill`, `fields:fill:all` or a `fields:fill:group=…`.
- **Rights.** `authorizeFieldAssignment()`: a group takes `fields:set-group` for it, anyone `fields:set-group:all`, since it reaches every group, and unassigned nothing. `fieldRights().setGroup` is `{ all: true }` exactly when a user may give a field to anyone.
- **Prediction.** `formFieldOfDraft()` and `formFieldAfter()` give the assignment, and the `groupId` it reads as, as the engine reads them back.
- **The wire.** A named `FieldAssignment` component, a closed union on `kind`. `FormFieldDTOSchema` reads a field of a server older than `assignment` by its group, and `completeFormBundle()` does the same for a bundle kept from before it. `FIELD_ASSIGNMENT_SINCE` (`'3.5'`) is the version it arrives in on the wire.
- **Conformance.** `runAnyoneFieldsConformance()` and its fixture `ANYONE_FIELDS_PDF` hold both engines to the rules, the lock included.

A field built by hand as a `FormField` (a test fixture) needs `assignment`.
