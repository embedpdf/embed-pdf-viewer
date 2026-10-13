---
'@embedpdf/viewer': minor
---

The viewer-only settings of stamps and signatures go in `plugins`, next to the plugin's own: `plugins.stamp.standard` and `plugins.stamp.quick` (`['standard:Approved']`), `plugins.signature.kinds` and `plugins.signature.fonts`, and the signer in `plugins.signature.key`. The `stamps` and `signatures` keys are gone; `ViewerStampSettings`, `ViewerSignatureSettings` and `SignatureFont` replace `StampsCustomization` and `SignaturesCustomization`. Typed signatures offer three handwriting fonts by default (Allura, Great Vibes, Caveat, from `@embedpdf/default-signature-fonts`), each a lazy chunk of your build.

A smaller first load, in the npm build and the CDN folder alike: the panels and dialogs of each feature are chunks of their own, fetched in the background once the document shows and the browser is idle, and the signature cryptography loads the first time someone signs or a document's signatures are checked.
