<!-- Generated from docs/content/headless/annotations/stamps.mdx and packages/default-signature-fonts/NOTICE.md by docs/content/scripts/readmes.mjs. Edit there, then run `pnpm readme:sync`. -->

# @embedpdf/default-signature-fonts

Three handwriting fonts for typed signatures and initials in EmbedPDF: Allura, Great Vibes and Caveat.

## Handwriting fonts for typed marks

A typed signature looks like one in a handwriting font. Three come as a package:

```sh
npm install @embedpdf/default-signature-fonts
```

| Key           | Font                             | Size   |
| :------------ | :------------------------------- | :----- |
| `allura`      | Allura: formal, like a signature | 81 KB  |
| `great-vibes` | Great Vibes: flowing calligraphy | 159 KB |
| `caveat`      | Caveat: casual handwriting       | 125 KB |

Give them to the plugin's `fonts` setting, and a typed mark names one by its key:

```ts
import {
  DEFAULT_SIGNATURE_FONTS,
  loadSignatureFont,
} from '@embedpdf/default-signature-fonts/library';

stampPlugin({
  fonts: DEFAULT_SIGNATURE_FONTS.map(({ key }) => ({
    key,
    load: () => loadSignatureFont(key),
  })),
});
```

```ts
await stamp.createAsset({
  libraryId,
  label: 'Signature',
  mark: {
    kind: 'text',
    text: 'Ada Lovelace',
    fontFamily: 'allura',
  },
});
```

Each font is a lazy chunk of your build: its file downloads the first time a mark names it, and
the engine embeds it in the PDF, so the mark looks the same in every PDF reader. The fonts cover
Latin, Latin Extended and Vietnamese; Caveat has no Vietnamese. The ready-made viewer offers the
three by default.

## Documentation

- [Stamps](https://www.embedpdf.com/docs/headless/react/annotations/stamps): Libraries of reusable stamps, as Acrobat-compatible PDFs, placed by click or by code, made from annotations, and kept across sessions.

## License

(Apache-2.0 AND OFL-1.1)

The fonts are licensed under the SIL Open Font License 1.1; each licence is
in `licenses/`, with its copyright holders. They are subsets of the
originals from [google/fonts](https://github.com/google/fonts) (Latin,
Latin Extended and Vietnamese), and Caveat is pinned at its Regular weight.
None of the three reserves its font name, so the subsets keep their names.
The package's code is Apache-2.0.

Allura © 2010 The Allura Project Authors · Great Vibes © 2015 The Great
Vibes Pro Project Authors · Caveat © 2014 The Caveat Project Authors.
