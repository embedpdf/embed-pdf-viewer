# @embedpdf/default-signature-fonts

## 1.0.1

### Patch Changes

- [#1070](https://github.com/embedpdf/embed-pdf-viewer/pull/1070) by [@bobsingor](https://github.com/bobsingor) – The package's page on npm shows how to give the three fonts to the stamp plugin, with the fonts' license notice under it. The notice is a file of the package too, `NOTICE.md`.

## 1.0.0

### Minor Changes

- [#869](https://github.com/embedpdf/embed-pdf-viewer/pull/869) by [@bobsingor](https://github.com/bobsingor) – Introduces the default handwriting fonts for typed signatures and initials: Allura, Great Vibes and Caveat, under the SIL Open Font License, as Latin, Latin Extended and Vietnamese subsets. `loadSignatureFont(key)` from `@embedpdf/default-signature-fonts/library` loads one font's TrueType bytes as a lazy module of your build, and `DEFAULT_SIGNATURE_FONTS` lists their keys, family names and labels; the `.ttf` files are exported too.

## 1.0.0-next.1

### Minor Changes

- [#869](https://github.com/embedpdf/embed-pdf-viewer/pull/869) by [@bobsingor](https://github.com/bobsingor) – Introduces the default handwriting fonts for typed signatures and initials: Allura, Great Vibes and Caveat, under the SIL Open Font License, as Latin, Latin Extended and Vietnamese subsets. `loadSignatureFont(key)` from `@embedpdf/default-signature-fonts/library` loads one font's TrueType bytes as a lazy module of your build, and `DEFAULT_SIGNATURE_FONTS` lists their keys, family names and labels; the `.ttf` files are exported too.
