---
'@embedpdf/viewer-chrome': minor
---

The viewer speaks thirteen languages: English, German, French, Spanish, Italian, Dutch, Portuguese (Brazil), Polish, Japanese, Chinese (Simplified, `zh-CN`), Korean, Arabic and Hebrew. English is in every build; each other language is a chunk of its own that loads the first time the viewer shows it. The eleven languages besides English and Spanish are machine-translated in the terms Adobe Acrobat uses in each language, and are waiting for a native speaker's review. Spanish now calls redaction "Censurar", as Acrobat does.

In Arabic and Hebrew the viewer reads right to left: the bars mirror, `start` and `end` swap sides, and the zoom field, the search panel, menus and panels lay out from the right. A language you add through `strings` reads right to left when its code says so (`fa`, `ur`, `ku-Arab`), and is named in itself (`sv` is "svenska") where the browser knows the language. A `strings` code matches the viewer's own languages in any case (`zh-cn` is `zh-CN`).

A built-in button's label has its command's id as its key in `strings`, per language: `strings: { de: { 'document:download': 'Kopie speichern' } }` relabels that one button in German, and a language with no string for the id keeps its own label. The zoom field's buttons take their commands' labels, and the search panel's previous and next buttons are translated.
