---
'@embedpdf/viewer-chrome': minor
---

Features, as All features, Annotations and Forms & signatures describe them:

- The settings only the viewer has sit next to their plugin's, in `plugins`: `plugins.stamp.standard` (`true`, the standard stamps from your own build; a URL with `{locale}`; or `false` for none), `plugins.stamp.quick` (stamps shown in the Insert toolbar as `library:name`, `standard` for the standard stamps: `['standard:Approved']`) and `plugins.stamp.sidebar`; `plugins.signature.kinds`, `plugins.signature.fonts` and `plugins.signature.libraries`. The `stamps` and `signatures` keys are gone: `key`, `mode`, `trust` and `allowCertify` are the signature plugin's own settings in `plugins.signature`, and `assetEngine` the stamp plugin's in `plugins.stamp`. `ViewerStampSettings`, `ViewerSignatureSettings` and `SignatureFont` replace `StampsCustomization` and `SignaturesCustomization`.
- Typed signatures offer three handwriting fonts by default, Allura, Great Vibes and Caveat, each read the first time the signature maker's Type tab opens on it and embedded in the PDF a typed mark goes into. A `plugins.signature.fonts` list replaces them; a font there is a `url` or its `data`. Helvetica and Times are no longer offered for typed marks.
- A feature's interface isn't part of the first load: the search, comments, style, stamps, signatures, redaction and measurement panels, the signature maker, sign dialog and inspector, the redaction confirmation, the calibration dialog and the link editor are chunks of their own. Once a document shows and the browser is idle, the viewer fetches them in the background, so they still open at once; one opened before that loads right then.
