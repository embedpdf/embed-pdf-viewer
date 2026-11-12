---
'@embedpdf/engine-core': minor
'@embedpdf/engine-services': patch
---

A free text create or update can say `textAlign: 'auto'`: the text's first strong character decides its alignment and direction, as HTML's `dir="auto"` does. Right-to-left text (Hebrew, Arabic and the other right-to-left scripts) is written right-aligned (`/Q 2`) with a right-to-left body; any other text left-aligned. An update without new text follows the current text. Reads never return `'auto'`. `textDirectionOf(text)` exposes the rule.
