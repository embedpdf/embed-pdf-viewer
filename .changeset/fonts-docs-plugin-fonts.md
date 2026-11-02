---
'@embedpdf/plugin-fonts': minor
---

Asking for the CSS of a font that isn't a standard one (`getFontCss`, `getFaceCss`) starts reading the document's fonts, after the asker's turn: an editor that draws in a document's font needs no `ensureLoaded()` of its own. A font's CSS names the fallbacks in the order the engine tries them for its style, so a bold font's Hebrew or Arabic draws in the bold fallback, as the engine writes it.
