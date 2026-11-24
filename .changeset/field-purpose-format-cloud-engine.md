---
'@cloudpdf/engine': minor
---

A form field has a `purpose` (what its value means, such as `'email'`), and a text field or a dropdown a `format` (`{ kind: 'date', pattern }`, `{ kind: 'time', pattern }`): `doc.forms.create()` and `doc.forms.update()` take both, and every read returns them. `isDatePattern()` and `isTimePattern()` say whether a string is a pattern a date or a time format is written with, and `STANDARD_DATE_PATTERNS` and `STANDARD_TIME_PATTERNS` are Acrobat's own lists of them.

Writing either needs a server of version 3.4. An older one is never sent them: a create, an update or a change that names a `purpose` or a `format` fails with `NotImplemented`, and `details.needs` and `details.serverVersion` say which side to update. An import (`doc.forms.import()`) of a bundle in which a field has a purpose fails the same way, since such a server would make the field without it and report nothing left out. Reading works against an older server: `format` is read from the field's scripts, and `purpose` reads `null`, in the fields of an exported bundle too.
