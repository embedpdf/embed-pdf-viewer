# @embedpdf/plugin-i18n

## 2.2.0

## 2.1.2

## 2.1.1

## 2.1.0

## 2.0.2

## 2.0.1

## 2.0.0

### Major Changes

- [#279](https://github.com/embedpdf/embed-pdf-viewer/pull/279) by [@bobsingor](https://github.com/bobsingor) – ## Multi-Document Support

  The i18n plugin now supports locale management and translation with document awareness.

  ### Breaking Changes
  - **Plugin Architecture**: Complete rewrite to support locale registration, translation, and document-scoped operations.
  - **State Management**: Plugin now maintains locale state and translation registrations.
  - **Translation API**: Translation methods now support document context for document-specific translations.

  ### Framework-Specific Changes (React/Preact, Svelte, Vue)
  - **Translate Component**:
    - New component for rendering translations (React/Preact: `@embedpdf/plugin-i18n/react`, Svelte: `@embedpdf/plugin-i18n/svelte`, Vue: `@embedpdf/plugin-i18n/vue`)
    - Supports optional `documentId` prop for document-scoped translations
    - Supports render props pattern via `children` prop
  - **useTranslation Hook**:
    - Now supports optional `documentId` parameter for document-scoped translations
    - `useTranslations(documentId?)` hook for getting document-scoped translation function

  ### New Features
  - Locale registration and management
  - Translation with parameter resolution
  - Document-scoped translation operations via `forDocument()` method
  - Translation parameter change events
  - Locale change events
  - Integration with commands plugin for command translations

### Patch Changes

- [#303](https://github.com/embedpdf/embed-pdf-viewer/pull/303) by [@bobsingor](https://github.com/bobsingor) – Fixed Vue `useTranslations` hook reactivity for `locale` computed property. The `locale` value now correctly updates when the locale changes.

## 2.0.0-next.3

## 2.0.0-next.2

## 2.0.0-next.1

### Patch Changes

- [`caec11d`](https://github.com/embedpdf/embed-pdf-viewer/commit/caec11d7e8b925e641b4834aadf9a126edfb3586) by [@bobsingor](https://github.com/bobsingor) – Fixed Vue `useTranslations` hook reactivity for `locale` computed property. The `locale` value now correctly updates when the locale changes.

## 2.0.0-next.0

### Major Changes

- [#279](https://github.com/embedpdf/embed-pdf-viewer/pull/279) by [@bobsingor](https://github.com/bobsingor) – ## Multi-Document Support

  The i18n plugin now supports locale management and translation with document awareness.

  ### Breaking Changes
  - **Plugin Architecture**: Complete rewrite to support locale registration, translation, and document-scoped operations.
  - **State Management**: Plugin now maintains locale state and translation registrations.
  - **Translation API**: Translation methods now support document context for document-specific translations.

  ### Framework-Specific Changes (React/Preact, Svelte, Vue)
  - **Translate Component**:
    - New component for rendering translations (React/Preact: `@embedpdf/plugin-i18n/react`, Svelte: `@embedpdf/plugin-i18n/svelte`, Vue: `@embedpdf/plugin-i18n/vue`)
    - Supports optional `documentId` prop for document-scoped translations
    - Supports render props pattern via `children` prop
  - **useTranslation Hook**:
    - Now supports optional `documentId` parameter for document-scoped translations
    - `useTranslations(documentId?)` hook for getting document-scoped translation function

  ### New Features
  - Locale registration and management
  - Translation with parameter resolution
  - Document-scoped translation operations via `forDocument()` method
  - Translation parameter change events
  - Locale change events
  - Integration with commands plugin for command translations
