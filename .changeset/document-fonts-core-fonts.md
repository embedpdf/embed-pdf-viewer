---
'@embedpdf/core-fonts': minor
---

Add the last-resort font: `lastResortFontProgram()` and `LAST_RESORT_HASH`, a tiny program that draws every character as a box, for text no other font has. `StandardFontMetrics.codePoints` lists the code points a standard font draws. Rename `FontProgram` to `MountableFontProgram`.

The package now resolves to its built files outside the repository's development condition.
