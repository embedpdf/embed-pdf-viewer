---
'@embedpdf/plugin-fonts': patch
---

A font's CSS and a box's paint fonts end their fallbacks with the standard font that stands in for the font, as the engine writes them: Latin a font lacks (Noto Sans Hebrew has none) shows in Helvetica, in the same weight, never as boxes.
