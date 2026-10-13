---
'@embedpdf/default-signature-fonts': minor
---

Introduces the default handwriting fonts for typed signatures and initials: Allura, Great Vibes and Caveat, under the SIL Open Font License, as Latin, Latin Extended and Vietnamese subsets. `loadSignatureFont(key)` from `@embedpdf/default-signature-fonts/library` loads one font's TrueType bytes as a lazy module of your build, and `DEFAULT_SIGNATURE_FONTS` lists their keys, family names and labels; the `.ttf` files are exported too.
