---
'@embedpdf/plugin-commands': minor
---

New standard commands: `tool:snapshot`, not allowed without `doc.content.copy` (`commands.notAllowed.doc-content-copy`); `snapshot:copy` (`Mod+C`), `snapshot:save` (a PNG named after the document and the page) and `snapshot:clear` (`Escape`), each enabled while there is a snapshot. `StandardCommandsPlatform` has `copyImage(image)`, and `saveFile` takes the file's content type. Commands that share a key take turns: a key runs the one that can run now, wherever it is in the list, so Escape lets a snapshot go even though cancelling a drawing has Escape too.
