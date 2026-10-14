---
'@embedpdf/engine-runtime': patch
---

Preserve explicit image masks, optional-content layers, rendering intent and
interpolation when redacting scanned images. Remove page thumbnails, embedded
preview copies and alternate image versions that could retain redacted content
in saved documents.
