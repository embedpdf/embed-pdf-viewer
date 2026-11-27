---
'@cloudpdf/sdk': minor
---

Who fills a form field in, as one `assignment`: `FormField` has it (a `FieldAssignment`: `group`, `anyone` or `unassigned`), and `FormFieldDraft` and `FormFieldPatch` take it beside `groupId`. It needs a server of version 3.5: an older one refuses a draft or a patch that names it, so send such a server `groupId`.
