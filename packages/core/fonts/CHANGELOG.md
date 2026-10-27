# @embedpdf/core-fonts

## 3.0.0-next.17

## 3.0.0-next.16

## 3.0.0-next.15

### Major Changes

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) – Introduces the 14 standard PDF fonts as the engine draws them: PDFium's built-in faces as OpenType programs a browser can load (`standardFontProgram(font)`, named in CSS by their hash, about 20 KB each, loaded on first use), the advances, ascent and descent the engine lays text out with in them (`standardFontMetrics(font)`), and their CSS (`standardFontCss(font)`). Generated from the fork's font data; ships PDFium's notice.
