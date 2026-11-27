---
'@cloudpdf/sdk': minor
---

A form field that anyone fills in: `FormField` has `forAnyone`, and `FormFieldDraft` and `FormFieldPatch` take it. It needs a server of version 3.5: an older one refuses a draft or a patch that names it.
