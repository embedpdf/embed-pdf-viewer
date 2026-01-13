# @embedpdf/plugin-annotation

## 2.2.0

### Minor Changes

- [#389](https://github.com/embedpdf/embed-pdf-viewer/pull/389) by [@bobsingor](https://github.com/bobsingor) – Add permission checking for annotation operations:
  - Check `PdfPermissionFlag.ModifyAnnotations` before creating, updating, or deleting annotations
  - Check permission before activating annotation tools
  - Check permission before creating annotations from text selection
  - Update `AnnotationContainer` components (React, Svelte, Vue) to respect `canModifyAnnotations` permission:
    - Disable drag/resize when permission is denied
    - Hide vertex handles when permission is denied
    - Guard double-click handlers based on permission

## 2.1.2

## 2.1.1

## 2.1.0

## 2.0.2

## 2.0.1

## 2.0.0

### Major Changes

- [#279](https://github.com/embedpdf/embed-pdf-viewer/pull/279) by [@bobsingor](https://github.com/bobsingor) – ## Multi-Document Support

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

### Patch Changes

- [#303](https://github.com/embedpdf/embed-pdf-viewer/pull/303) by [@bobsingor](https://github.com/bobsingor) – Fixed Vue `AnnotationContainer` component where `mixBlendMode` style was incorrectly applied to the selection menu. The style now only applies to the annotation content div, matching the behavior of React and Svelte implementations. This was caused by Vue's attribute inheritance passing the style to the root element which wrapped both the annotation and the selection menu.

## 2.0.0-next.3

## 2.0.0-next.2

## 2.0.0-next.1

## 2.0.0-next.0

### Major Changes

- [#279](https://github.com/embedpdf/embed-pdf-viewer/pull/279) by [@bobsingor](https://github.com/bobsingor) – ## Multi-Document Support

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

## 1.5.0

## 1.4.1

## 1.4.0

## 1.3.16

## 1.3.15

## 1.3.14

### Patch Changes

- [`fb323ea`](https://github.com/embedpdf/embed-pdf-viewer/commit/fb323ea28c02b43d885760c952e5a5cf9a0461f9) by [@bobsingor](https://github.com/bobsingor) – Update event type definitions for vue annotation handlers

- [`867c84f`](https://github.com/embedpdf/embed-pdf-viewer/commit/867c84f139ac4f6a9d92ab662985c918e70b86f7) by [@bobsingor](https://github.com/bobsingor) – Add blend mode styling to Vue annotation components

## 1.3.13

### Patch Changes

- [#209](https://github.com/embedpdf/embed-pdf-viewer/pull/209) by [@bobsingor](https://github.com/bobsingor) – Introduces a deepToRaw utility to recursively unwrap Vue refs/reactives, and applies it to annotation rendering to prevent unnecessary re-renders.

- [#208](https://github.com/embedpdf/embed-pdf-viewer/pull/208) by [@bobsingor](https://github.com/bobsingor) – Introduces Vue components for annotation features, including annotation containers, layers, paint layers, and annotation types (circle, square, ink, etc.). Integrates annotation tools into the Vue-Vuetify example, updates toolbar and application logic to support annotation mode, and refactors shared annotation types for better modularity. Also adds supporting hooks and utilities for annotation interaction and state management.

## 1.3.12

## 1.3.11

## 1.3.10

## 1.3.9

## 1.3.8

## 1.3.7

## 1.3.6

## 1.3.5

## 1.3.4

## 1.3.3

## 1.3.2

## 1.3.1

## 1.3.0

### Minor Changes

- [#172](https://github.com/embedpdf/embed-pdf-viewer/pull/172) by [@bobsingor](https://github.com/bobsingor) – Custom render function if you want the frontend behaviour of annotation to be different

### Patch Changes

- [#172](https://github.com/embedpdf/embed-pdf-viewer/pull/172) by [@bobsingor](https://github.com/bobsingor) – Fix issue with forwarding props on text markups

- [#168](https://github.com/embedpdf/embed-pdf-viewer/pull/168) by [@Ludy87](https://github.com/Ludy87) – Add license fields to the package.json with the value MIT

## 1.2.1

### Patch Changes

- [#164](https://github.com/embedpdf/embed-pdf-viewer/pull/164) by [@bobsingor](https://github.com/bobsingor) – Fix defaults on annotation stamp

- [#164](https://github.com/embedpdf/embed-pdf-viewer/pull/164) by [@bobsingor](https://github.com/bobsingor) – Make interaction mode optional fallback on tool id

## 1.2.0

### Minor Changes

- [#153](https://github.com/embedpdf/embed-pdf-viewer/pull/153) by [@bobsingor](https://github.com/bobsingor) – Remove active variant and make it easier with addTool

### Patch Changes

- [#153](https://github.com/embedpdf/embed-pdf-viewer/pull/153) by [@bobsingor](https://github.com/bobsingor) – Add events on update,delete,create annotations

- [#153](https://github.com/embedpdf/embed-pdf-viewer/pull/153) by [@bobsingor](https://github.com/bobsingor) – Ability to customize the vertex UI and resize UI and the outline selection color

- [#153](https://github.com/embedpdf/embed-pdf-viewer/pull/153) by [@bobsingor](https://github.com/bobsingor) – Fix issue with free text that the text is not selectable

- [#153](https://github.com/embedpdf/embed-pdf-viewer/pull/153) by [@bobsingor](https://github.com/bobsingor) – Move the handlers to the annotation plugin itself to make the framework layer smaller

- [#153](https://github.com/embedpdf/embed-pdf-viewer/pull/153) by [@bobsingor](https://github.com/bobsingor) – Ability to selectAfterCreate, deactiveToolAfterCreate and also overwrite this behavrious on the tool itself

## 1.1.1

## 1.1.0

## 1.0.26

## 1.0.25

## 1.0.24

## 1.0.23

## 1.0.22

## 1.0.21

## 1.0.20

## 1.0.19

### Patch Changes

- [#75](https://github.com/embedpdf/embed-pdf-viewer/pull/75) by [@bobsingor](https://github.com/bobsingor) – Update engine model to make it more clear for developers

## 1.0.18

## 1.0.17

### Patch Changes

- [#63](https://github.com/embedpdf/embed-pdf-viewer/pull/63) by [@bobsingor](https://github.com/bobsingor) – Add support for comments on annotations

## 1.0.16

### Patch Changes

- [#59](https://github.com/embedpdf/embed-pdf-viewer/pull/59) by [@bobsingor](https://github.com/bobsingor) – Add mobile support for annotations

## 1.0.15

### Patch Changes

- [#54](https://github.com/embedpdf/embed-pdf-viewer/pull/54) by [@bobsingor](https://github.com/bobsingor) – Add support for image stamp

## 1.0.14

### Patch Changes

- [#52](https://github.com/embedpdf/embed-pdf-viewer/pull/52) by [@bobsingor](https://github.com/bobsingor) – Add support for (basic) free text annotation

## 1.0.13

### Patch Changes

- [#51](https://github.com/embedpdf/embed-pdf-viewer/pull/51) by [@bobsingor](https://github.com/bobsingor) – Add support for polygon, polyline, line, arrow line annotations

- [#49](https://github.com/embedpdf/embed-pdf-viewer/pull/49) by [@bobsingor](https://github.com/bobsingor) – Add support for square and circle annotations

- [`0a83f83`](https://github.com/embedpdf/embed-pdf-viewer/commit/0a83f838728b5d2d5c8d44c91b95f99a08248d30) by [@bobsingor](https://github.com/bobsingor) – Abilty to add selection menu, Proper page boundries on annotation moving, and proper cursor

## 1.0.12

### Patch Changes

- [#46](https://github.com/embedpdf/embed-pdf-viewer/pull/46) by [@bobsingor](https://github.com/bobsingor) – Ability to generate AP stream with blend mode and show blendmode in annotations

- [#47](https://github.com/embedpdf/embed-pdf-viewer/pull/47) by [@bobsingor](https://github.com/bobsingor) – Update annotation plugin to have shared code between react and preact to simplify workflow

## 1.0.11

## 1.0.10

## 1.0.9

## 1.0.8

### Patch Changes

- [#38](https://github.com/embedpdf/embed-pdf-viewer/pull/38) by [@bobsingor](https://github.com/bobsingor) – Improvements on text markup annotations (proper AP stream generation) and support for ink annotation

## 1.0.7

### Patch Changes

- [#35](https://github.com/embedpdf/embed-pdf-viewer/pull/35) by [@bobsingor](https://github.com/bobsingor) – Text markup annotation support (Highlight, Underline, Strikeout, Squiggle)

## 1.0.6

## 1.0.5

## 1.0.4

## 1.0.3

## 1.0.2

## 1.0.1

### Patch Changes

- [#15](https://github.com/embedpdf/embed-pdf-viewer/pull/15) by [@bobsingor](https://github.com/bobsingor) – Expose a couple of missing APIs for the MUI example package
