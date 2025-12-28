# @embedpdf/fonts-tc

Traditional Chinese (Big5) fallback fonts for EmbedPDF.

## Included Fonts

All 7 weights of Noto Sans Hant (Traditional Chinese):

- `NotoSansHant-Thin.otf` - Thin weight (100)
- `NotoSansHant-Light.otf` - Light weight (300)
- `NotoSansHant-DemiLight.otf` - DemiLight weight (350)
- `NotoSansHant-Regular.otf` - Regular weight (400)
- `NotoSansHant-Medium.otf` - Medium weight (500)
- `NotoSansHant-Bold.otf` - Bold weight (700)
- `NotoSansHant-Black.otf` - Black weight (900)

## Usage

```typescript
import { FontCharset } from '@embedpdf/models';

const fontFallback = {
  fonts: {
    [FontCharset.CHINESEBIG5]: [
      { url: 'NotoSansHant-Thin.otf', weight: 100 },
      { url: 'NotoSansHant-Light.otf', weight: 300 },
      { url: 'NotoSansHant-DemiLight.otf', weight: 350 },
      { url: 'NotoSansHant-Regular.otf', weight: 400 },
      { url: 'NotoSansHant-Medium.otf', weight: 500 },
      { url: 'NotoSansHant-Bold.otf', weight: 700 },
      { url: 'NotoSansHant-Black.otf', weight: 900 },
    ],
  },
  baseUrl: 'https://cdn.jsdelivr.net/npm/@embedpdf/fonts-tc@1/fonts',
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

Noto Sans Hant is a trademark of Google LLC.
