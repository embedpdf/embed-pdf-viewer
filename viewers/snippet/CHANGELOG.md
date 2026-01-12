# @embedpdf/snippet

## 2.2.0

### Minor Changes

- [#389](https://github.com/embedpdf/embed-pdf-viewer/pull/389) by [@bobsingor](https://github.com/bobsingor) – Add document security and protection features:
  - Add `ProtectModal` component for setting document encryption with user/owner passwords and permission restrictions
  - Add `UnlockOwnerOverlay` component to notify users when viewing protected documents with restricted permissions
  - Add `ViewPermissionsModal` component for viewing and unlocking document permissions
  - Add `PermissionsDisplay` component for showing permission status
  - Add permission-based command disabling for annotation, redaction, print, copy, and capture commands
  - Add security-related translations for English, German, Dutch, French, Spanish, and Chinese
  - Add new icons: `EyeIcon`, `EyeOffIcon`, `InfoIcon`, `UnlockIcon`
  - Update UI schema with protection modal, view permissions modal, and unlock owner overlay

- [#389](https://github.com/embedpdf/embed-pdf-viewer/pull/389) by [@bobsingor](https://github.com/bobsingor) – Add global permission configuration to snippet viewer:
  - Add `permissions` option to `PDFViewerConfig` for global permission overrides
  - Support `enforceDocumentPermissions` to ignore PDF permissions entirely
  - Support `overrides` with human-readable names (`print`, `modifyAnnotations`, etc.) or numeric flags
  - Update command permission checks to use effective permissions via `getEffectivePermission`
  - Pass permission configuration to `EmbedPDF` via new `config` prop

## 2.1.2

### Patch Changes

- [#369](https://github.com/embedpdf/embed-pdf-viewer/pull/369) by [@bobsingor](https://github.com/bobsingor) – Add missing translations for redaction delete and commit commands (`redaction.deleteSelected` and `redaction.commitSelected`) in all supported languages (English, German, Dutch, French, Spanish).

- [#381](https://github.com/embedpdf/embed-pdf-viewer/pull/381) by [@bobsingor](https://github.com/bobsingor) –
  - Add i18n support for capture and print dialogs with translations for all supported languages
  - Add `document:capture` command to toolbar for screenshot functionality
  - Refactor hint-layer and capture components to use translation hooks
  - Remove unused `@types/classnames` dependency

- [#378](https://github.com/embedpdf/embed-pdf-viewer/pull/378) by [@bobsingor](https://github.com/bobsingor) –
  - Add Simplified Chinese (zh-CN) translations for all UI elements
  - Add i18n support for annotation type labels in comment sidebar with translation keys and fallbacks
  - Fix rimraf command to use `--glob` flag for compatibility with rimraf v4+

## 2.1.1

## 2.1.0

### Patch Changes

- [`db26b8f`](https://github.com/embedpdf/embed-pdf-viewer/commit/db26b8f1b29fa99549bc7dfd9deef8be604b1a0b) by [@bobsingor](https://github.com/bobsingor) – Update documentation to use jsDelivr CDN
  - Changed import URL from `https://snippet.embedpdf.com/embedpdf.js` to `https://cdn.jsdelivr.net/npm/@embedpdf/snippet@2/dist/embedpdf.js`
  - Updated code examples to assign `EmbedPDF.init()` result to a `viewer` variable

## 2.0.2

### Patch Changes

- [#357](https://github.com/embedpdf/embed-pdf-viewer/pull/357) by [@bobsingor](https://github.com/bobsingor) – Fixed search result scrolling not working while search is still in progress on large documents.

## 2.0.1

### Patch Changes

- [#307](https://github.com/embedpdf/embed-pdf-viewer/pull/307) by [@bobsingor](https://github.com/bobsingor) –
  - Fixed iOS zoom issue on input focus by changing text size from `text-sm` to `text-base` in form inputs
  - Fullscreen button icon now dynamically updates to show exit icon when in fullscreen mode
  - Improved zoom menu UI schema with unique item IDs and better responsive behavior

- [#308](https://github.com/embedpdf/embed-pdf-viewer/pull/308) by [@bobsingor](https://github.com/bobsingor) – Added `selection:copy-to-clipboard` command with keyboard shortcuts (Ctrl+C / Cmd+C) that copies selected text without clearing the selection, providing a better user experience for keyboard-based copying.

## 2.0.0

### Minor Changes

- [#303](https://github.com/embedpdf/embed-pdf-viewer/pull/303) by [@bobsingor](https://github.com/bobsingor) – Added comprehensive type exports for all plugin Capabilities and Scopes, enabling proper TypeScript support when using plugin APIs.

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

- [#303](https://github.com/embedpdf/embed-pdf-viewer/pull/303) by [@bobsingor](https://github.com/bobsingor) – Added global `disabledCategories` config and hierarchical categories for fine-grained feature control.

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

- [#303](https://github.com/embedpdf/embed-pdf-viewer/pull/303) by [@bobsingor](https://github.com/bobsingor) – Added Spanish translations, improved i18n support, and enhanced plugin configuration API.

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
