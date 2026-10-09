---
'@embedpdf/engine': minor
---

Add `doc.signatures` for signature inspection, revision analysis, and two-phase signing with externally supplied CMS data. Support signature-field creation and visual appearances, expose the saved document version, and update the same document handle after signing.

Open every document as an immutable base with an editable layer. Preserve the loaded bytes on unchanged incremental downloads and add Node file-backed layer opens and `downloadToFile()`.

Enforce declared signature restrictions by default, distinguish them from modification verdicts, and expose `signedDocumentPolicy` for applications that need to permit invalidating edits.
