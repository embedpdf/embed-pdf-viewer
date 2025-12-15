---
'@embedpdf/snippet': minor
---

Added Spanish translations, improved i18n support, and enhanced plugin configuration API.

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
