---
'@embedpdf/engine-core': minor
---

A form field has two more facts: its `purpose` (what its value means) and, on a text field and a dropdown, its `format` (the shape its value has).

- **`purpose: string | null`** on every `FormField`, and in `FormFieldDraft` and `FormFieldPatch`, where `null` means none. The engine keeps it with the field and reads nothing into it. A purpose is 1 to 256 characters with no space at its start or end (`isFieldPurpose()`); anything else is refused with `InvalidArg`.
- **`format: FormFieldFormat | null`** on `TextField` and `ComboBoxField`: `{ kind: 'date', pattern }`, `{ kind: 'time', pattern }`, `{ kind: 'other' }` for a format script the engine doesn't recognise, or `null` without one. It is read from the field's format script, as Acrobat decides it (`formatOfActions()`): `AFDate_FormatEx("pattern")`, the older `AFDate_Format(n)`, and the same two calls for a time. A keystroke script on its own is no format.
- **A draft and a patch take `format: FormFieldFormatWritable | null`**, a date or a time. The engine writes the field's format script and keystroke script from the pattern, as Acrobat writes them, so it takes `doc.forms.modify` and no `doc.forms.script`. `null` removes both scripts. An `other` format is read, never written.
- **Patterns, per kind:** `isDatePattern()` and `isTimePattern()` say whether a string is a pattern a date or a time format is written with, and `STANDARD_DATE_PATTERNS` and `STANDARD_TIME_PATTERNS` are the patterns Acrobat's older calls name by number. A pattern is one a field can show and read back. A date's has at least one date group, may carry one time written with colons (`m/d/yy HH:MM`), and has no two numbers touching. A time's is a time and nothing else (`HH:MM`, `h:MM:ss tt`). So `yyyymmdd`, `HH.MM`, a time alone as a date and a date as a time are refused in a write, and a format script that uses one reads as `other`.
- `formFieldOfDraft()` and `formFieldAfter()` work out both facts, and the two scripts a format write leaves in `actions`. `fieldDraftOf()` keeps both in a copy and an import; a date or a time format comes along without `doc.forms.script`.
- `FormFieldDTOSchema` reads a field from a server older than both facts: no purpose, and the format its scripts give. `FormFieldFormatSchema` reads a kind it doesn't know as `other`. `withCatchAll()` takes a fourth argument that fills in what an older server leaves out. `FIELD_PURPOSE_AND_FORMAT_SINCE` is the version both arrived in on the wire.
- `runFieldPurposeFormatConformance` checks both facts on an engine: reads, writes, refusals, undo, copies, imports and the permission each takes.

A field you build by hand as a `FormField` (in a test, say) now needs `purpose`, and a text field or a dropdown `format`.
