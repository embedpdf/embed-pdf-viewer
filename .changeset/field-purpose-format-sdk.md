---
'@cloudpdf/sdk': minor
---

A form field's `purpose` and `format`: `FormField` has `purpose`, and its text and combobox kinds `format` (`FormFieldFormat`, or `null`). `FormFieldDraft` and `FormFieldPatch` take `purpose`, and `format` (`FormFieldFormatWritable`, a date or a time with its pattern) for a text field and a dropdown; `null` removes either in a patch.

Both need a server of version 3.4: an older one refuses a draft or a patch that names either.
