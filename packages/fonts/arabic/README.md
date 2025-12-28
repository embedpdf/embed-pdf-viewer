# @embedpdf/fonts-arabic

Arabic fallback fonts for EmbedPDF.

## Included Fonts

- `NotoNaskhArabic-Regular.ttf` - Regular weight (400)
- `NotoNaskhArabic-Bold.ttf` - Bold weight (700)

## Usage

```typescript
import { FontCharset } from '@embedpdf/models';

const fontFallback = {
  fonts: {
    [FontCharset.ARABIC]: [
      { url: 'NotoNaskhArabic-Regular.ttf', weight: 400 },
      { url: 'NotoNaskhArabic-Bold.ttf', weight: 700 },
    ],
  },
  baseUrl: 'https://cdn.jsdelivr.net/npm/@embedpdf/fonts-arabic@1/fonts',
};
```

## License

These fonts are licensed under the [SIL Open Font License 1.1](https://scripts.sil.org/OFL).

Noto Naskh Arabic is a trademark of Google LLC.
