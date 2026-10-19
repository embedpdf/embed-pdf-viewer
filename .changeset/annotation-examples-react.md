---
'@embedpdf/react': patch
---

`<AnnotationLayer>`: an `interactive` renderer takes the pointer (its buttons and fields get clicks without CSS of their own), and a renderer that draws a text box with `useRichTextEditor()` can be typed in: its subtree stops being inert while the box is edited, and `editor.style` takes the pointer while typing.
