---
'@embedpdf/engine-core': minor
---

Page text ends its lines in `\n` and leaves out the characters a reader can't see as text. A line break PDFium extracts as `\r\n` gives `\n`: its `\r` keeps its place in character space and gives no text. A Unicode noncharacter gives no text either, so a word PDFium joined across a line-end hyphen (which it marks with U+FFFE) reads, copies and searches whole: `Verita-` and `serum` read `Veritaserum`. Character positions don't change, so selections, highlights and search hits are where they were. New exports: `toPageText` (the projection), `isNoncharacter` and `toLineBreaks`.

Search ignores invisible characters, so a match runs across a soft hyphen, a zero-width space or joiner, a bidi mark, U+FEFF, a control code other than whitespace, or a noncharacter. `SEARCH_FOLD_VERSION` is now 2.

Every other string the engine returns ends its lines in `\n` too: an annotation's `contents` (its rich text's plain projection joins paragraphs with `\n`) and a hard line break inside a rich text run, which `RichTextRun.text` now spells `\n`.
