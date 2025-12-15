---
'@embedpdf/snippet': minor
---

Added comprehensive type exports for all plugin Capabilities and Scopes, enabling proper TypeScript support when using plugin APIs.

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
