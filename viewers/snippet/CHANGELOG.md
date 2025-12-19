# @embedpdf/snippet

## 2.0.0-next.4

## 2.0.0-next.3

## 2.0.0-next.2

### Minor Changes

- [`89b94a0`](https://github.com/embedpdf/embed-pdf-viewer/commit/89b94a09659ad63eeab6b66fc56f8110a07a8f57) by [@bobsingor](https://github.com/bobsingor) – Added comprehensive type exports for all plugin Capabilities and Scopes, enabling proper TypeScript support when using plugin APIs.

  ### New Type Exports

  All plugins now export their `*Capability` and `*Scope` types, allowing developers to properly type variables when using `plugin.provides()` and `forDocument()`:
  - **Viewport**: `ViewportCapability`, `ViewportScope`, `ViewportMetrics`
  - **Scroll**: `ScrollCapability`, `ScrollScope`, `ScrollMetrics`, `PageChangeEvent`, `ScrollEvent`, `LayoutChangeEvent`
  - **Spread**: `SpreadCapability`, `SpreadScope`
  - **Zoom**: `ZoomCapability`, `ZoomScope`, `ZoomLevel`, `ZoomChangeEvent`
  - **Rotate**: `RotateCapability`, `RotateScope`
  - **Tiling**: `TilingCapability`, `TilingScope`
  - **Thumbnail**: `ThumbnailCapability`, `ThumbnailScope`
  - **Annotation**: `AnnotationCapability`, `AnnotationScope`, `AnnotationEvent`
  - **Search**: `SearchCapability`, `SearchScope`
  - **Selection**: `SelectionCapability`, `SelectionScope`
  - **Capture**: `CaptureCapability`, `CaptureScope`
  - **Redaction**: `RedactionCapability`, `RedactionScope`, `RedactionMode`, `RedactionItem`
  - **UI**: `UIScope` (UICapability was already exported)
  - **I18n**: `I18nCapability`, `I18nScope`, `Locale`, `LocaleChangeEvent`
  - **Commands**: `CommandScope` (CommandsCapability was already exported)
  - **DocumentManager**: `DocumentManagerCapability`, `DocumentChangeEvent`, `LoadDocumentUrlOptions`, `LoadDocumentBufferOptions`
  - **Print**: `PrintCapability`, `PrintScope`
  - **Fullscreen**: `FullscreenCapability`
  - **Bookmark**: `BookmarkCapability`, `BookmarkScope`
  - **Export**: `ExportCapability`, `ExportScope`
  - **Pan**: `PanCapability`, `PanScope`
  - **History**: `HistoryCapability`, `HistoryScope`
  - **Attachment**: `AttachmentCapability`, `AttachmentScope`
  - **Render**: `RenderCapability`, `RenderScope`
  - **InteractionManager**: `InteractionManagerCapability`, `InteractionManagerScope`

  ### Usage Example

  ```typescript
  import {
    ScrollPlugin,
    type ScrollCapability,
    type ScrollScope,
    type PageChangeEvent,
  } from '@embedpdf/snippet';

  // Type the capability returned by provides()
  const scroll: ScrollCapability = registry
    .getPlugin<ScrollPlugin>('scroll')
    ?.provides();

  // Type the scoped API for a specific document
  const doc: ScrollScope = scroll.forDocument('my-document');

  // Type event callbacks
  scroll.onPageChange((event: PageChangeEvent) => {
    console.log(`Page ${event.pageNumber} of ${event.totalPages}`);
  });
  ```

- [#293](https://github.com/embedpdf/embed-pdf-viewer/pull/293) by [@github-actions](https://github.com/apps/github-actions) – Added global `disabledCategories` config and hierarchical categories for fine-grained feature control.

  **Global `disabledCategories` Configuration**

  Added `disabledCategories` to the root `PDFViewerConfig` that applies to both UI and Commands plugins:

  ```typescript
  const config: PDFViewerConfig = {
    src: 'document.pdf',
    // Disable all annotation and redaction features globally
    disabledCategories: ['annotation', 'redaction'],
  };
  ```

  Plugin-specific settings can override the global setting:

  ```typescript
  const config: PDFViewerConfig = {
    disabledCategories: ['annotation'], // Global default
    ui: {
      disabledCategories: ['redaction'], // Overrides for UI only
    },
    commands: {
      disabledCategories: [], // Re-enables all for commands
    },
  };
  ```

  **Hierarchical Categories**

  All commands and UI schema items now have hierarchical categories for granular control:
  - `annotation` - all annotation features
    - `annotation-markup` - highlight, underline, strikeout, squiggly
      - `annotation-highlight`, `annotation-underline`, etc.
    - `annotation-shape` - rectangle, circle, line, arrow, polygon, polyline
      - `annotation-rectangle`, `annotation-circle`, etc.
    - `annotation-ink`, `annotation-text`, `annotation-stamp`
  - `redaction` - all redaction features
    - `redaction-text`, `redaction-area`, `redaction-apply`, `redaction-clear`
  - `zoom` - all zoom features
    - `zoom-in`, `zoom-out`, `zoom-fit-page`, `zoom-fit-width`, `zoom-marquee`
    - `zoom-level` - all zoom level presets
  - `document` - document operations
    - `document-open`, `document-close`, `document-print`, `document-export`, `document-fullscreen`
  - `panel` - sidebar panels
    - `panel-sidebar`, `panel-search`, `panel-comment`, `panel-annotation-style`
  - `page` - page settings
    - `spread`, `scroll`, `rotate`
  - `history` - undo/redo
    - `history-undo`, `history-redo`
  - `mode` - viewer modes
    - `mode-view`, `mode-annotate`, `mode-shapes`, `mode-redact`
  - `tools` - tool buttons
    - `pan`, `pointer`, `capture`

  Example: Disable only print functionality while keeping export:

  ```typescript
  disabledCategories: ['document-print'];
  ```

- [#293](https://github.com/embedpdf/embed-pdf-viewer/pull/293) by [@github-actions](https://github.com/apps/github-actions) – Added Spanish translations, improved i18n support, and enhanced plugin configuration API.

  ### New Features
  - **Spanish Translations**: Added Spanish (`es`) locale support with complete translations for all UI elements and commands.
  - **Annotation Sidebar Translations**: Sidebar titles are now properly translated using i18n keys. Added missing translation keys (`annotation.freeText`, `annotation.square`, `annotation.styles`, `annotation.defaults`) to all 5 languages.

  ### Improvements
  - **Partial Plugin Configs**: All plugin configuration options in `PDFViewerConfig` now use `Partial<>` types, making it easier to override only the settings you need without specifying all required fields.
  - **Reactive Blend Mode Labels**: Blend mode dropdown labels in the annotation sidebar now update reactively when the language changes.
  - **Search Sidebar Layout**: Changed search options checkboxes from horizontal to vertical layout for better compatibility with longer translated labels.

  ```typescript
  // Override just specific settings
  <PDFViewer
    config={{
      src: '/document.pdf',
      zoom: { defaultZoomLevel: ZoomMode.FitWidth },
      i18n: { defaultLocale: 'es' }, // Use Spanish translations
    }}
  />
  ```
