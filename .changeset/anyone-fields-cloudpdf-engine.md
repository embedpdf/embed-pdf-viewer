---
'@cloudpdf/engine': minor
---

A form field's `assignment` says who fills it in: one group's signers, anyone, or no one in particular. `doc.forms.create()`, `doc.forms.update()` and the `forms.create` and `forms.update` ops of `doc.apply()` take it beside `groupId`, every read returns `field.assignment` (a `FieldAssignment`, which this package exports), and `doc.security.allowsField('fill', field)` answers for a field anyone fills in.

A server older than 3.5 knows only `groupId`: a group's or an unassigned field's assignment goes to it as that, in what an update expects too, and any other assignment goes as it is, for that server to refuse. A field anyone fills in is never sent to it: such a create, update or change fails with `NotImplemented`, and `details.needs` and `details.serverVersion` say which side to update. So does an import (`doc.forms.import()`) of a bundle with such a field, which an older server would make an unassigned one. Reading works against an older server: each field reads its assignment from its group, in an exported bundle too.
