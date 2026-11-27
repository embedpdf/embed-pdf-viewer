---
'@cloudpdf/engine': minor
---

A form field can be one anyone fills in: `doc.forms.create()`, `doc.forms.update()` and the `forms.create` and `forms.update` ops of `doc.apply()` take `forAnyone`, every read returns `field.forAnyone`, and `doc.security.allowsField('fill', field)` answers for such a field. A field is in a group or `forAnyone`, never both: marking a field takes it out of its group, and a group takes the mark away.

Writing it needs a server of version 3.5. An older one is never sent it: a create, an update or a change that names `forAnyone` (`false` too, and in `expect`) fails with `NotImplemented`, and `details.needs` and `details.serverVersion` say which side to update. So does an import (`doc.forms.import()`) of a bundle with such a field, which an older server would make an ordinary field. Reading works against an older server: every field reads `forAnyone: false`, in an exported bundle too.
