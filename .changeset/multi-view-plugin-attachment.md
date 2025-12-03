---
'@embedpdf/plugin-attachment': major
---

## Multi-Document Support

The attachment plugin now supports accessing attachments from multiple documents.

### Breaking Changes

- **Methods**: All methods now accept an optional `documentId` parameter and operate on the active document by default:
  - `getAttachments(documentId?)` - Returns attachments for the specified or active document
  - `downloadAttachment(attachment, documentId?)` - Downloads attachment from the specified or active document

- **Capability**: Added `forDocument(documentId)` method that returns `AttachmentScope` for document-specific operations.

### Framework-Specific Changes (React/Preact, Svelte, Vue)

- **Hooks**:
  - Added Svelte hooks support (`@embedpdf/plugin-attachment/svelte`)
  - All hooks work with document-scoped capabilities via `forDocument()`

### New Features

- `AttachmentScope` interface for document-scoped attachment operations
- Support for accessing attachments from any document, not just the active one
