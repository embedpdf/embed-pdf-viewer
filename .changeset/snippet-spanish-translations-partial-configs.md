---
'@embedpdf/snippet': minor
---

Added Spanish translations and improved plugin configuration API.

### New Features

- **Spanish Translations**: Added Spanish (`es`) locale support with complete translations for all UI elements and commands.

### Improvements

- **Partial Plugin Configs**: All plugin configuration options in `PDFViewerConfig` now use `Partial<>` types, making it easier to override only the settings you need without specifying all required fields.

```typescript
// Before: Had to provide full config objects
// After: Can override just specific settings
<PDFViewer
  config={{
    src: '/document.pdf',
    zoom: { defaultZoomLevel: ZoomMode.FitWidth }, // Only override what you need
    i18n: { defaultLocale: 'es' }, // Use Spanish translations
  }}
/>
```
