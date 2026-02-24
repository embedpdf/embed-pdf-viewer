# @embedpdf/fonts-hebrew

Hebrew fallback fonts for EmbedPDF.

## Included Fonts

- `NotoSansHebrew-Regular.ttf` - Regular weight (400)
- `NotoSansHebrew-Bold.ttf` - Bold weight (700)

## Usage

```typescript
import { FontCharset } from '@embedpdf/models';

const fontFallback = {
  fonts: {
    [FontCharset.HEBREW]: [
      { url: 'NotoSansHebrew-Regular.ttf', weight: 400 },
      { url: 'NotoSansHebrew-Bold.ttf', weight: 700 },
    ],
  },
  baseUrl: 'https://cdn.jsdelivr.net/npm/@embedpdf/fonts-hebrew@1/fonts',
};
```

## License

These fonts are licensed under the [SIL Open Font License 1.1](https://scripts.sil.org/OFL).

Noto Sans Hebrew is a trademark of Google LLC.
