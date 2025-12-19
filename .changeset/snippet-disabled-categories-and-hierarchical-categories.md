---
'@embedpdf/snippet': minor
---

Added global `disabledCategories` config and hierarchical categories for fine-grained feature control.

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
