---
'@embedpdf/engine-runtime': minor
---

A standard font that a document doesn't embed (Helvetica, Times, Courier, and their aliases such as Arial) now draws with PDFium's built-in face on every platform, as it already did in the browser and on Linux hosts without those fonts. Before, the native builds took the system's font of that name where there was one (Arial, Times New Roman and Courier New on macOS), so the same document drew differently there. A CJK code page still asks the system for its font.
