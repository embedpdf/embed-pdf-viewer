---
'@cloudpdf/server': minor
---

A form field's `purpose` and `format`: a create (`POST .../form/fields`), an update (`PATCH .../form/fields/{field}`) and the `forms.create` and `forms.update` ops of a change take both, and every field a response carries has `purpose`, and `format` on a text field and a dropdown. Both need `doc.forms.modify`; a date or a time format needs no `doc.forms.script`.

The form's and the form export's engine values are raised, so answers with the new fields get new URLs.
