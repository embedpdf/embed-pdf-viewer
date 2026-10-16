---
'@embedpdf/react': minor
---

Tapping a form field or editing a free text box on iOS no longer zooms the page in: their editors lay their text out at 16 px or more and draw it back at the page's size. `useRichTextEditor()`'s `style` now also makes your element fill its parent at that legible size, so draw the box's fill, border and padding on the parent: anything on the element itself scales with its text.
