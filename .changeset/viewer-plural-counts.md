---
'@embedpdf/viewer-chrome': patch
---

Counts read right in every language: the number of files and comments, search results, redaction marks and selected annotations each pick their language's plural form, such as Polish's `few` and `many` and Arabic's six forms, instead of choosing between a singular and a plural word or a "Label: 3" wording. `attachments.countPlural` and `comments.countPlural` are gone: `attachments.count`, `comments.count`, `demo.searchResults`, `demo.redactConfirmBody`, `demo.redactConfirmCollateral` and `stylePanel.selected` take plural forms in `strings`, such as `{ one: '{count} file', other: '{count} files' }`.
