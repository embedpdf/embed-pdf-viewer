---
'@embedpdf/plugin-fonts': minor
---

A font's CSS names its programs once the browser has them all: until then the system's look-alikes draw the text, never the last resort's boxes. Asking for the CSS loads them, and `getPaintFontsEpoch()` moves when a CSS answer may change (the list changed, or a program arrived). A font the list doesn't name, or the list before it's read, draws in Helvetica, and the look-alikes after a document's or the engine's font are those of the standard font the engine falls back to for its face: no family is mounted by key any more. A read that asks for the document's fonts starts reading them after its turn, so asking from a render changes no state during it.
