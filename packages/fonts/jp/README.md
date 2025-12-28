# @embedpdf/fonts-jp

Japanese (Shift-JIS) fallback fonts for EmbedPDF.

## Included Fonts

All 7 weights of Noto Sans JP:

- `NotoSansJP-Thin.otf` - Thin weight (100)
- `NotoSansJP-Light.otf` - Light weight (300)
- `NotoSansJP-DemiLight.otf` - DemiLight weight (350)
- `NotoSansJP-Regular.otf` - Regular weight (400)
- `NotoSansJP-Medium.otf` - Medium weight (500)
- `NotoSansJP-Bold.otf` - Bold weight (700)
- `NotoSansJP-Black.otf` - Black weight (900)

## Usage

```typescript
import { FontCharset } from '@embedpdf/models';

const fontFallback = {
  fonts: {
    [FontCharset.SHIFTJIS]: [
      { url: 'NotoSansJP-Thin.otf', weight: 100 },
      { url: 'NotoSansJP-Light.otf', weight: 300 },
      { url: 'NotoSansJP-DemiLight.otf', weight: 350 },
      { url: 'NotoSansJP-Regular.otf', weight: 400 },
      { url: 'NotoSansJP-Medium.otf', weight: 500 },
      { url: 'NotoSansJP-Bold.otf', weight: 700 },
      { url: 'NotoSansJP-Black.otf', weight: 900 },
    ],
  },
  baseUrl: 'https://cdn.jsdelivr.net/npm/@embedpdf/fonts-jp@1/fonts',
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

Noto Sans JP is a trademark of Google LLC.
