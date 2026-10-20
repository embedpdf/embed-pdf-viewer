---
'@embedpdf/core-fonts': minor
---

Add the last-resort font: `lastResortFontProgram()` and `LAST_RESORT_HASH`, a tiny program that draws every character as a box, for text no other font has. It asks never to be subset, so a PDF embeds its one box whole. `StandardFontMetrics.codePoints` lists the code points a standard font draws. `standardFontStack(font)` is a standard face's system look-alikes as a CSS family list. Rename `FontProgram` to `MountableFontProgram`.

The package now resolves to its built files outside the repository's development condition.

`lastResortFontBytes()` returns the last-resort program's bytes from a module that reaches nothing else, for an engine to register.

`LAST_RESORT_METRICS` gives the numbers the engine lays the last-resort box out with: its advance, ascent and descent.
