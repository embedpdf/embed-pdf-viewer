# @embedpdf/fonts-sc

Simplified Chinese (GB2312) fallback fonts for EmbedPDF.

## Included Fonts

5 weights of Noto Sans Hans (Simplified Chinese):

- `NotoSansHans-Light.otf` - Light weight (300)
- `NotoSansHans-DemiLight.otf` - DemiLight weight (350)
- `NotoSansHans-Regular.otf` - Regular weight (400)
- `NotoSansHans-Medium.otf` - Medium weight (500)
- `NotoSansHans-Bold.otf` - Bold weight (700)

Note: Thin and Black weights are not included to keep the package under size limits.

## Usage

```typescript
import { FontCharset } from '@embedpdf/models';

const fontFallback = {
  fonts: {
    [FontCharset.GB2312]: [
      { url: 'NotoSansHans-Light.otf', weight: 300 },
      { url: 'NotoSansHans-DemiLight.otf', weight: 350 },
      { url: 'NotoSansHans-Regular.otf', weight: 400 },
      { url: 'NotoSansHans-Medium.otf', weight: 500 },
      { url: 'NotoSansHans-Bold.otf', weight: 700 },
    ],
  },
  baseUrl: 'https://cdn.jsdelivr.net/npm/@embedpdf/fonts-sc@1/fonts',
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

Noto Sans Hans is a trademark of Google LLC.
