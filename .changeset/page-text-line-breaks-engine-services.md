---
'@embedpdf/engine-services': patch
---

Page text comes from `toPageText`: lines end in `\n`, and noncharacters such as the U+FFFE PDFium writes for a joined line-end hyphen give no text. An annotation's `/Contents` reads with `\n` line breaks and is written with `\r`, as Acrobat writes it. Hard line breaks in rich text runs read as `\n` and are written as `\r`.
