---
'@embedpdf/plugin-annotation': major
---

## Multi-Document Support

The annotation plugin now supports multiple documents with per-document annotation state and tool management.

### Breaking Changes

- **All Actions**: All annotation actions now require a `documentId` parameter:
  - `setAnnotations(documentId, annotations)` - was `setAnnotations(annotations)`
  - `selectAnnotation(documentId, pageIndex, id)` - was `selectAnnotation(pageIndex, id)`
  - `deselectAnnotation(documentId)` - was `deselectAnnotation()` (no params)
  - `setActiveToolId(documentId, toolId)` - was `setActiveToolId(toolId)`
  - `createAnnotation(documentId, pageIndex, annotation)` - was `createAnnotation(pageIndex, annotation)`
  - `patchAnnotation(documentId, pageIndex, id, patch)` - was `patchAnnotation(pageIndex, id, patch)`
  - `deleteAnnotation(documentId, pageIndex, id)` - was `deleteAnnotation(pageIndex, id)`
  - `commitPendingChanges(documentId)` - was `commitPendingChanges()` (no params)
  - `purgeAnnotation(documentId, uid)` - was `purgeAnnotation(uid)`

- **State Structure**: Plugin state now uses `documents: Record<string, AnnotationDocumentState>` instead of a flat structure. Each document has its own annotations, selected annotation, and active tool.

- **Capability Methods**: All capability methods that previously operated on a single document now require document scoping or operate on the active document by default.

### Framework-Specific Changes (React/Preact, Svelte, Vue)

- **AnnotationContainer Component**:
  - Now requires `documentId` prop (React/Preact: `@embedpdf/plugin-annotation/react`, Svelte: `@embedpdf/plugin-annotation/svelte`, Vue: `@embedpdf/plugin-annotation/vue`)
  - Component now uses `forDocument(documentId)` to get document-scoped annotation capability
  - `selectionMenu` prop type changed to `AnnotationSelectionMenuRenderFn` for better type safety
  - Bounding box constraints now use unscaled page dimensions (scale is applied internally)

- **Annotation Hooks**:
  - All hooks now work with document-scoped capabilities via `forDocument()`
  - Components automatically scope operations to the provided `documentId`

### New Features

- Per-document annotation storage and management
- Per-document active tool tracking
- Document lifecycle hooks for automatic state initialization and cleanup
- `forDocument()` method for document-scoped operations
