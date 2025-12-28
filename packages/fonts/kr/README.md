# @embedpdf/fonts-kr

Korean (Hangeul) fallback fonts for EmbedPDF.

## Included Fonts

All 7 weights of Noto Sans KR:

- `NotoSansKR-Thin.otf` - Thin weight (100)
- `NotoSansKR-Light.otf` - Light weight (300)
- `NotoSansKR-DemiLight.otf` - DemiLight weight (350)
- `NotoSansKR-Regular.otf` - Regular weight (400)
- `NotoSansKR-Medium.otf` - Medium weight (500)
- `NotoSansKR-Bold.otf` - Bold weight (700)
- `NotoSansKR-Black.otf` - Black weight (900)

## Usage

```typescript
import { FontCharset } from '@embedpdf/models';

const fontFallback = {
  fonts: {
    [FontCharset.HANGEUL]: [
      { url: 'NotoSansKR-Thin.otf', weight: 100 },
      { url: 'NotoSansKR-Light.otf', weight: 300 },
      { url: 'NotoSansKR-DemiLight.otf', weight: 350 },
      { url: 'NotoSansKR-Regular.otf', weight: 400 },
      { url: 'NotoSansKR-Medium.otf', weight: 500 },
      { url: 'NotoSansKR-Bold.otf', weight: 700 },
      { url: 'NotoSansKR-Black.otf', weight: 900 },
    ],
  },
  baseUrl: 'https://cdn.jsdelivr.net/npm/@embedpdf/fonts-kr@1/fonts',
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

Noto Sans KR is a trademark of Google LLC.
