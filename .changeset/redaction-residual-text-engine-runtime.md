---
'@embedpdf/engine-runtime': patch
---

Fix native and WASM text redaction when multiple regions intersect the same text
object. Later regions no longer leave targeted text searchable or copyable in
saved PDFs or remove neighboring text. Preserve the positions of remaining text,
including vertical text.

Remove stale replacement and alternate text associated with redacted content,
correct redaction inside transformed nested forms, and preserve unredacted uses
of shared images and forms.

Fixes [#801](https://github.com/embedpdf/embed-pdf-viewer/issues/801).
