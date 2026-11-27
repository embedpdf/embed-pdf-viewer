---
'@cloudpdf/contract': minor
---

A form field that anyone fills in. `FormField` has `forAnyone` (a boolean), and `FormFieldDraft` and `FormFieldPatch` take it; the `forms.create` and `forms.update` ops of `doc.changes` carry it the same way. It arrives in 3.5: a server older than that refuses a draft or a patch that names it with `InvalidArg`, so a client sends it only to a server that has it.
