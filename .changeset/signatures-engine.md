---
'@embedpdf/engine': minor
---

Add `doc.signatures` for signature inspection, revision analysis, and two-phase signing with externally supplied CMS data. Support signature-field creation and visual appearances, expose the saved document version, and update the same document handle after signing.

Open documents as immutable bases with editable layers by default, with `sessionKind: 'plain'` available for unsigned documents. Preserve the loaded bytes on unchanged incremental downloads and add Node file-backed layer opens and `downloadToFile()`.

Enforce declared signature restrictions by default, distinguish them from modification verdicts, and expose `signedDocumentPolicy` for applications that need to permit invalidating edits.
