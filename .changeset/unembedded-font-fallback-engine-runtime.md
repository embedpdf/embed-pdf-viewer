---
'@embedpdf/engine-runtime': patch
---

A page with text in a font its PDF names but doesn't embed renders when a fallback font fills in its characters, where rendering it crashed. That is Chinese text with a Chinese fallback font, and Hebrew and Arabic text with the fallback fonts the engine comes with. Each character keeps the width the PDF gives it.
