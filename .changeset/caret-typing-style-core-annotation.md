---
'@embedpdf/core-annotation': minor
---

New `typeWithStyle(before, after, at, style)`: the text typed at a caret takes a style chosen there, a line break carries the style on to the next line, and any other edit drops it. New `restyleRuns(doc, change)` and `withoutStyle(style, keys)` change every run's own style. A whole free text restyled by hand now restyles all of its text: `setTextFormat` and a font, size or text color in `setFields` set the body and take that property off every word that set its own, so a box typed bold from its first letter turns regular with one toggle.
