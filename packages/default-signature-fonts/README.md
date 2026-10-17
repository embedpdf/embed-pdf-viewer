# @embedpdf/default-signature-fonts

Three handwriting fonts for typed signatures and initials, for
`@embedpdf/plugin-signature` and the full viewer's signature maker:

| Key           | Font        | Style                    | Size   |
| ------------- | ----------- | ------------------------ | ------ |
| `allura`      | Allura      | Formal, signature-like   | 81 KB  |
| `great-vibes` | Great Vibes | Flowing calligraphy      | 159 KB |
| `caveat`      | Caveat      | Casual handwriting       | 125 KB |

Each is a TrueType file the engine embeds in the PDF, so a typed mark looks
the same in every PDF reader. They cover Latin, Latin Extended and
Vietnamese (Caveat has no Vietnamese).

## Use

```ts
import { DEFAULT_SIGNATURE_FONTS, loadSignatureFont } from '@embedpdf/default-signature-fonts/library';

const bytes = await loadSignatureFont('allura'); // a lazy chunk of your build
```

Each font is its own lazy module: your bundler splits it out, and it
downloads only when someone types a signature. The `.ttf` files are exported
too (`@embedpdf/default-signature-fonts/fonts/Allura-Regular.ttf`).

## Licences

The fonts are licensed under the SIL Open Font License 1.1; each licence is
in `licenses/`, with its copyright holders. They are subsets of the
originals from [google/fonts](https://github.com/google/fonts) (Latin,
Latin Extended and Vietnamese), and Caveat is pinned at its Regular weight.
None of the three reserves its font name, so the subsets keep their names.
The package's code is Apache-2.0.

Allura © 2010 The Allura Project Authors · Great Vibes © 2015 The Great
Vibes Pro Project Authors · Caveat © 2014 The Caveat Project Authors.
