# @embedpdf/default-fallback-fonts

The fonts the EmbedPDF engine fills in Hebrew and Arabic with, when the font a
text names doesn't have them:

| Key                      | Font              | Weight | Size   |
| ------------------------ | ----------------- | ------ | ------ |
| `noto-sans-hebrew`       | Noto Sans Hebrew  | 400    | 25 KB  |
| `noto-sans-hebrew-bold`  | Noto Sans Hebrew  | 700    | 25 KB  |
| `noto-naskh-arabic`      | Noto Naskh Arabic | 400    | 131 KB |
| `noto-naskh-arabic-bold` | Noto Naskh Arabic | 700    | 129 KB |

The engine adds them as fallback fonts by default, after any you add yourself,
so Hebrew and Arabic work with no setup. `localEngine({ defaultFallbackFonts:
false })` leaves them out; `engine.fonts.clearFallbacks()` removes them along
with yours.

## Use

The engine loads them for you. To load one yourself:

```ts
import {
  DEFAULT_FALLBACK_FONTS,
  loadFallbackFont,
} from '@embedpdf/default-fallback-fonts/library';

const bytes = await loadFallbackFont('noto-sans-hebrew'); // a lazy chunk of your build
```

Each font is its own lazy module: your bundler splits it out. The `.ttf` files
are exported too (`@embedpdf/default-fallback-fonts/fonts/NotoSansHebrew-Regular.ttf`).

## Licences

The fonts are Google's Noto fonts, licensed under the Apache License 2.0
(`licenses/Noto-Apache-2.0.txt`), as their files say; the package's code is
Apache-2.0 too. Noto is a trademark of Google LLC.

Noto Sans Hebrew © 2012 Google Inc. · Noto Naskh Arabic © 2014 Google Inc.
