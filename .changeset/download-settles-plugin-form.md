---
'@embedpdf/plugin-form': minor
---

A download includes the text being typed in a field. The plugin keeps what is typed and commits it before the file is read, matching Acrobat, which commits the field being edited before a save. Framework adapters report typing through three new host members: `draftText(field, text)` on each keystroke, `commitDraftText(field)` on blur or Enter (the field's scripts run then; it resolves `null` when there is nothing to write), and `discardDraftText(field)` on Escape. A download also waits for value writes still on their way.
