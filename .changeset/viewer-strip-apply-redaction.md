---
'@embedpdf/viewer-chrome': minor
---

Selected redaction marks can be applied from the `annotation` bar: its new `annotation:apply-redaction` command shows when every selected annotation is a redaction mark, and asks first in the same confirmation as `redaction:apply`, counting only those marks and the other annotations under them. The confirmation's title takes plural forms in `strings` now (`demo.redactConfirmTitle`), and the command's label is `commands.redact.apply`, such as `{ one: 'Apply Redaction', other: 'Apply {count} Redactions' }`.
