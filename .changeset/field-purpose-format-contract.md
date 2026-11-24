---
'@cloudpdf/contract': minor
---

A form field's `purpose` and `format`.

- `FormField` has `purpose` (a string, or `null`), and its text and combobox kinds have `format`: `FormFieldFormat` (`{ kind: 'date', pattern }`, `{ kind: 'time', pattern }` or `{ kind: 'other' }`), or `null`. A newer server can add kinds of format: read one your client doesn't know as `other`.
- `FormFieldDraft` and `FormFieldPatch` take `purpose` (1 to 256 characters with no NUL, or `null` for none) and, for a text field and a dropdown, `format`: `FormFieldFormatWritable` (a date or a time with its pattern), or `null` for none. The `forms.create` and `forms.update` ops of `doc.changes` carry them the same way.

Both arrive in 3.4. A server older than that refuses a draft or a patch that names either with `InvalidArg`, so a client sends them only to a server that has them.
