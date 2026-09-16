---
'@embedpdf/engine': minor
---

Support reading and authoring rich-text FreeText annotations through the local engine. Expose document-level font embedding and typographic settings through `doc.fonts`.

Return resolved font identities and embedding permissions from registration, and add `engine.fonts.authorizeEditing()` for applications authorized to edit with preview-and-print fonts.
