# @embedpdf/core-fonts

## 3.0.0-next.20

### Minor Changes

- [#941](https://github.com/embedpdf/embed-pdf-viewer/pull/941) by [@bobsingor](https://github.com/bobsingor) – Add the last-resort font: `lastResortFontProgram()` and `LAST_RESORT_HASH`, a tiny program that draws every character as a box, for text no other font has. It asks never to be subset, so a PDF embeds its one box whole. `StandardFontMetrics.codePoints` lists the code points a standard font draws. `standardFontStack(font)` is a standard face's system look-alikes as a CSS family list. Rename `FontProgram` to `MountableFontProgram`.

  The package now resolves to its built files outside the repository's development condition.

  `lastResortFontBytes()` returns the last-resort program's bytes from a module that reaches nothing else, for an engine to register.

  `LAST_RESORT_METRICS` gives the numbers the engine lays the last-resort box out with: its advance, ascent and descent.

  `BUILT_IN_PROGRAMS`, `builtInProgramInfo(displayHash)` and `loadBuiltInProgram(displayHash)`: the standard faces' and the last resort's programs as a document's font list names them, which every engine answers for without reading the document.

- [#941](https://github.com/embedpdf/embed-pdf-viewer/pull/941) by [@bobsingor](https://github.com/bobsingor) – The one place a font is mapped to CSS without the fonts plugin: `standardFontOf(font)` (the standard font itself, Helvetica for any other), `standardFontForFace(face)` (its standard family's font in its weight and italic, Arial as Helvetica) and `standardFontOfProgramFamily(cssFamily)` (the standard font whose built-in program a family names). `standardFontCss(font)` also gives the program it names (`programs`), and the same object for the same font.

## 3.0.0-next.19

## 3.0.0-next.18

## 3.0.0-next.17

## 3.0.0-next.16

## 3.0.0-next.15

### Major Changes

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) – Introduces the 14 standard PDF fonts as the engine draws them: PDFium's built-in faces as OpenType programs a browser can load (`standardFontProgram(font)`, named in CSS by their hash, about 20 KB each, loaded on first use), the advances, ascent and descent the engine lays text out with in them (`standardFontMetrics(font)`), and their CSS (`standardFontCss(font)`). Generated from the fork's font data; ships PDFium's notice.
