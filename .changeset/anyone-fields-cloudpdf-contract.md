---
'@cloudpdf/contract': minor
---

Who fills a form field in, as one `assignment`: a `FieldAssignment` component with `kind` as its discriminator, `group` (with its `groupId`), `anyone` or `unassigned`. `FormField` has it, and `FormFieldDraft` and `FormFieldPatch` take it beside `groupId`; the `forms.create` and `forms.update` ops of `doc.changes` carry it the same way. It arrives in 3.5: a server older than that refuses a draft or a patch that names it with `InvalidArg`, so a client sends such a server a group's or an unassigned field's as `groupId`, and a field anyone fills in only to a server that has it.
