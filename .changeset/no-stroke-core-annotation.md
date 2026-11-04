---
'@embedpdf/core-annotation': minor
---

A style's `color` may be `null`: a shape or line drawn without a stroke. A color property's `allowsNone` says a panel may offer none, which writes `null`: on a shape's or line's stroke and fill, a text box's background, a redaction's fill and a form field's border and background.

A line, polyline or ink at width 0 is drawn as a hairline (`Paint.hairline`), with the line endings a 1 pt line has, as the engine and Acrobat draw it.
