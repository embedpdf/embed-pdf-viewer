# @embedpdf/plugin-view-manager

## 2.2.0

## 2.1.2

## 2.1.1

## 2.1.0

## 2.0.2

## 2.0.1

## 2.0.0

### Major Changes

- [#279](https://github.com/embedpdf/embed-pdf-viewer/pull/279) by [@bobsingor](https://github.com/bobsingor) – ## Multi-Document Support

  The view manager plugin enables managing multiple views, each containing multiple documents.

  ### Breaking Changes
  - **Plugin Architecture**: Complete rewrite to support view-based document management. Views are containers that can hold multiple documents.
  - **Actions**: All actions now operate on views and documents:
    - `createView(viewId, createdAt)` - Create a new view
    - `removeView(viewId)` - Remove a view
    - `addDocumentToView(viewId, documentId, index?)` - Add document to a view
    - `removeDocumentFromView(viewId, documentId)` - Remove document from a view
    - `moveDocumentWithinView(viewId, documentId, toIndex)` - Move document within a view
    - `setViewActiveDocument(viewId, documentId)` - Set active document for a view
    - `setFocusedView(viewId)` - Set the focused view
  - **State Structure**: Plugin state now tracks views, each containing multiple documents with their own active document.

  ### Framework-Specific Changes (React/Preact, Svelte, Vue)
  - **ViewContext Component**:
    - New component for managing view state and operations (React/Preact: `@embedpdf/plugin-view-manager/react`, Svelte: `@embedpdf/plugin-view-manager/svelte`, Vue: `@embedpdf/plugin-view-manager/vue`)
    - Requires `viewId` prop
    - Supports `autoCreate` prop to automatically create view if it doesn't exist
    - Provides render props with view state, document IDs, active document, focus state, and view actions

  ### New Features
  - View-based document organization
  - Multiple views with independent document collections
  - Per-view active document tracking
  - Focused view management
  - Document movement and reordering within views
  - View lifecycle management

## 2.0.0-next.3

## 2.0.0-next.2

## 2.0.0-next.1

## 2.0.0-next.0

### Major Changes

- [#279](https://github.com/embedpdf/embed-pdf-viewer/pull/279) by [@bobsingor](https://github.com/bobsingor) – ## Multi-Document Support

  The view manager plugin enables managing multiple views, each containing multiple documents.

  ### Breaking Changes
  - **Plugin Architecture**: Complete rewrite to support view-based document management. Views are containers that can hold multiple documents.
  - **Actions**: All actions now operate on views and documents:
    - `createView(viewId, createdAt)` - Create a new view
    - `removeView(viewId)` - Remove a view
    - `addDocumentToView(viewId, documentId, index?)` - Add document to a view
    - `removeDocumentFromView(viewId, documentId)` - Remove document from a view
    - `moveDocumentWithinView(viewId, documentId, toIndex)` - Move document within a view
    - `setViewActiveDocument(viewId, documentId)` - Set active document for a view
    - `setFocusedView(viewId)` - Set the focused view
  - **State Structure**: Plugin state now tracks views, each containing multiple documents with their own active document.

  ### Framework-Specific Changes (React/Preact, Svelte, Vue)
  - **ViewContext Component**:
    - New component for managing view state and operations (React/Preact: `@embedpdf/plugin-view-manager/react`, Svelte: `@embedpdf/plugin-view-manager/svelte`, Vue: `@embedpdf/plugin-view-manager/vue`)
    - Requires `viewId` prop
    - Supports `autoCreate` prop to automatically create view if it doesn't exist
    - Provides render props with view state, document IDs, active document, focus state, and view actions

  ### New Features
  - View-based document organization
  - Multiple views with independent document collections
  - Per-view active document tracking
  - Focused view management
  - Document movement and reordering within views
  - View lifecycle management
