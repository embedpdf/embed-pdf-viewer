---
'@embedpdf/engine-services': patch
---

A free text box written in a document font is drawn in that font's own program, and its `/DS` and `/RC` name the font's family, weight and italic. They used to name the font list's name, which no font in the file has, so the box was drawn in Helvetica while it read back the chosen name. A document font is found by the name the font list gives it, everything the PDF draws under that name, when a write or `resolve` names it. `resolve` uses the program a write would. A font program two font dictionaries read differently is served by display hash, so each download and coverage is the one its dictionary draws: both used to get the first dictionary's widths.
