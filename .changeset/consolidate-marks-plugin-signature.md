---
'@embedpdf/plugin-signature': patch
---

New: `signerRowsOf(libraries, assets)` and its `SignerRow` type, the people in a signatures picker (one row per stamp library of kind `signatures`, with the person's signatures and initials), derived from the stamp plugin's lists. Every framework's `useSignerRows()` is built on it.
