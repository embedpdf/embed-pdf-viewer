---
'@embedpdf/plugin-annotation': minor
---

A hovered redaction's label is drawn in its fonts as the engine picks them (`label.fonts`, from the fonts plugin), and again once they're found. Without the fonts plugin, a text box draws in the standard font the engine falls back to for its font or face, in that font's built-in program, and `getFamilyOfCss()` reads a standard program's family back as its face's family. A text box being typed in follows its programs as they reach the browser.
