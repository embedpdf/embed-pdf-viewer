---
'@embedpdf/engine-core': minor
---

`pdf.permissions` gives `doc.text.search` and `doc.text.select` whatever the file's copy flag says, as Acrobat finds and selects text in a file that forbids copying. The copy flag (bit 5) governs taking the text out: `doc.text.copy` and `doc.content.copy`, and through them a search's snippets. A copy-protected document is searchable, with matches but no snippets, and its text selectable, but not copied.
