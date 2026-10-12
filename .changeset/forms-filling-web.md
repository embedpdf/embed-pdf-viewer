---
'@embedpdf/web': minor
---

- A text field keeps the typed text when it loses focus until the field shows it, so it never flashes the old value; a value the form's validation refuses stays typed, as in Acrobat. `TextFieldDrafts.commitDraftText()` resolves with how the write ended (`{ status }`) or `null`.
