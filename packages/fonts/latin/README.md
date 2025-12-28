# @embedpdf/fonts-latin

Latin, Cyrillic, Greek, and Vietnamese fallback fonts for EmbedPDF.

## Included Fonts

All 9 weights of Noto Sans, including italic variants (18 fonts total):

| Weight           | Regular                   | Italic                          |
| ---------------- | ------------------------- | ------------------------------- |
| 100 (Thin)       | `NotoSans-Thin.ttf`       | `NotoSans-ThinItalic.ttf`       |
| 200 (ExtraLight) | `NotoSans-ExtraLight.ttf` | `NotoSans-ExtraLightItalic.ttf` |
| 300 (Light)      | `NotoSans-Light.ttf`      | `NotoSans-LightItalic.ttf`      |
| 400 (Regular)    | `NotoSans-Regular.ttf`    | `NotoSans-Italic.ttf`           |
| 500 (Medium)     | `NotoSans-Medium.ttf`     | `NotoSans-MediumItalic.ttf`     |
| 600 (SemiBold)   | `NotoSans-SemiBold.ttf`   | `NotoSans-SemiBoldItalic.ttf`   |
| 700 (Bold)       | `NotoSans-Bold.ttf`       | `NotoSans-BoldItalic.ttf`       |
| 800 (ExtraBold)  | `NotoSans-ExtraBold.ttf`  | `NotoSans-ExtraBoldItalic.ttf`  |
| 900 (Black)      | `NotoSans-Black.ttf`      | `NotoSans-BlackItalic.ttf`      |

## Supported Charsets

This font covers multiple charsets used by PDFium:

- `FontCharset.CYRILLIC` (204) - Russian, Ukrainian, Bulgarian, etc.
- `FontCharset.GREEK` (161) - Greek
- `FontCharset.VIETNAMESE` (163) - Vietnamese

## Usage

```typescript
import { FontCharset } from '@embedpdf/models';

const latinFonts = [
  { url: 'NotoSans-Thin.ttf', weight: 100 },
  { url: 'NotoSans-ThinItalic.ttf', weight: 100, italic: true },
  { url: 'NotoSans-ExtraLight.ttf', weight: 200 },
  { url: 'NotoSans-ExtraLightItalic.ttf', weight: 200, italic: true },
  { url: 'NotoSans-Light.ttf', weight: 300 },
  { url: 'NotoSans-LightItalic.ttf', weight: 300, italic: true },
  { url: 'NotoSans-Regular.ttf', weight: 400 },
  { url: 'NotoSans-Italic.ttf', weight: 400, italic: true },
  { url: 'NotoSans-Medium.ttf', weight: 500 },
  { url: 'NotoSans-MediumItalic.ttf', weight: 500, italic: true },
  { url: 'NotoSans-SemiBold.ttf', weight: 600 },
  { url: 'NotoSans-SemiBoldItalic.ttf', weight: 600, italic: true },
  { url: 'NotoSans-Bold.ttf', weight: 700 },
  { url: 'NotoSans-BoldItalic.ttf', weight: 700, italic: true },
  { url: 'NotoSans-ExtraBold.ttf', weight: 800 },
  { url: 'NotoSans-ExtraBoldItalic.ttf', weight: 800, italic: true },
  { url: 'NotoSans-Black.ttf', weight: 900 },
  { url: 'NotoSans-BlackItalic.ttf', weight: 900, italic: true },
];

const fontFallback = {
  fonts: {
    [FontCharset.CYRILLIC]: latinFonts,
    [FontCharset.GREEK]: latinFonts,
    [FontCharset.VIETNAMESE]: latinFonts,
  },
  baseUrl: 'https://cdn.jsdelivr.net/npm/@embedpdf/fonts-latin@1/fonts',
};
```

Or use the pre-configured CDN config:

```typescript
import { cdnFontConfig } from '@embedpdf/engines/pdfium';

const native = new PdfiumNative(pdfiumModule, {
  fontFallback: cdnFontConfig,
});
```

## License

These fonts are licensed under the [SIL Open Font License 1.1](https://scripts.sil.org/OFL).

Noto Sans is a trademark of Google LLC.
