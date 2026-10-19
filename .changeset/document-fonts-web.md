---
'@embedpdf/web': minor
---

The rich text editor draws each run in its whole face (`RichTextEditorFace`: family, weight and italic over the body's), so a bold run draws in the bold program instead of a faked bold. `RichTextEditorHost.cssFontFamily(face)` takes the face, `RichTextEditorProps.body` the box's body face, and `familyOfCss` reads back a family for a span the browser made itself. A drawn span keeps its run's family as data (`data-family`), so a program's CSS family never reads back as a family. `restyleFaces()` draws the spans again when the fonts change, without touching the text or the caret. `TextBoxEditorItem.face` is the box's body face. Text box and text field editors draw with `font-synthesis: none`.
