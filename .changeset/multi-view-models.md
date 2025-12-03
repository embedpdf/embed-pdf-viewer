---
'@embedpdf/models': minor
---

## Multi-Document Support

Minor updates to model types to support multi-document architecture.

### Changes

- **PdfDocumentObject**: Removed optional `name` property. Document identification is now handled through the `id` field.

- **PdfFileWithoutContent**: Removed optional `name` property. File identification is now handled through the `id` field.

### Migration

If you were using the `name` property on documents or files, you should now use the `id` field for identification purposes.
