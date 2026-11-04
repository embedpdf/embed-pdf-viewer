---
'@embedpdf/engine-core': minor
---

Every markup annotation has `richText`, its comment with formatting (`/RC`, ISO 32000-2 §12.5.6.2): a note, a highlight, a shape, a line, ink, a stamp, a caret, a file attachment or a redaction. It is the `RichTextDocument` a free text has, or `null` when the comment is plain text, and `contents` is its plain projection. A create or update with `richText` brings its `contents`; `contents` alone on a formatted comment replaces its paragraphs with plain ones and keeps its body; `richText: null` keeps the text and drops the formatting. `contents` and `richText` given together must say the same text, line breaks however spelled, for every kind. Links, popups and widgets have no `richText`. The rich text schemas are named `RichTextDocument` and `RichTextDocumentInput` among the annotation wire components.
