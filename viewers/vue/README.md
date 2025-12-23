<div align="center">
  <a href="https://www.embedpdf.com/vue-pdf-viewer">
    <img alt="EmbedPDF logo" src="https://www.embedpdf.com/logo-192.png" height="96">
  </a>

  <h1>Vue PDF Viewer</h1>
  <p>The easiest way to embed PDF files in your Vue 3 application with a complete, ready‑to‑use interface.</p>

<a href="https://www.embedpdf.com/vue-pdf-viewer"><img alt="Documentation" src="https://img.shields.io/badge/View%20Docs-0af?style=for-the-badge&labelColor=000000"></a>
<a href="https://app.embedpdf.com/"><img alt="Live Demo" src="https://img.shields.io/badge/Try%20Live%20Demo-ff1493.svg?style=for-the-badge&labelColor=000000"></a>
<a href="https://www.npmjs.com/package/@embedpdf/vue-pdf-viewer"><img alt="NPM Version" src="https://img.shields.io/npm/v/@embedpdf/vue-pdf-viewer?style=for-the-badge&labelColor=000000&color=blue"></a>

</div>

---

## 📚 Documentation

The full walkthrough, advanced examples, and API reference live in our docs site:

👉 **[https://www.embedpdf.com/vue-pdf-viewer](https://www.embedpdf.com/vue-pdf-viewer)**

---

## 🚀 Introduction

The `@embedpdf/vue-pdf-viewer` package provides a complete, production-ready PDF viewing experience for Vue 3 applications.

It is designed to be the fastest way to get a high-quality PDF viewer into your app. You don't need to build toolbars, handle layout logic, or worry about CSS—it just works.

### Key Features

- **Ready-to-use UI** — Includes a polished toolbar, sidebar, and thumbnails.
- **Responsive** — Adapts seamlessly to mobile and desktop screens.
- **Themable** — Built-in light/dark modes and support for custom brand colors.
- **Configurable** — Easily disable features you don't need (e.g., printing or downloading).
- **TypeScript** — Fully typed for a great developer experience.
- **Nuxt Ready** — Works seamlessly with Nuxt 3 and SSR.

---

## 📦 Installation

```bash
npm install @embedpdf/vue-pdf-viewer
# or
pnpm add @embedpdf/vue-pdf-viewer
# or
yarn add @embedpdf/vue-pdf-viewer
```

---

## 🛠 Basic Usage

Import the `PDFViewer` component and render it with a PDF source.

```vue
<template>
  <div style="height: 100vh">
    <PDFViewer
      :config="{
        src: 'https://snippet.embedpdf.com/ebook.pdf',
        theme: { preference: 'light' },
      }"
    />
  </div>
</template>

<script setup>
import { PDFViewer } from '@embedpdf/vue-pdf-viewer';
</script>
```

That's it! You now have a fully functional PDF viewer.

### Nuxt 3 Usage

The component works seamlessly with Nuxt 3. Since it uses browser APIs (Canvas, WebAssembly), wrap it in `<ClientOnly>` to avoid hydration errors:

```vue
<template>
  <ClientOnly>
    <PDFViewer :config="{ src: '/document.pdf' }" />
  </ClientOnly>
</template>
```

---

## 🎨 Customization

### Theme

The viewer includes a robust theming system. You can set the preference to `'light'`, `'dark'`, or `'system'`, and even override specific colors to match your brand.

```vue
<PDFViewer
  :config="{
    src: '/document.pdf',
    theme: {
      preference: 'system',
      light: {
        accent: {
          primary: '#42b883', // Custom brand color (Vue Green)
        },
      },
    },
  }"
/>
```

### Disabling Features

Easily customize the UI by disabling features you don't need via the `disabledCategories` option:

```vue
<PDFViewer
  :config="{
    src: '/document.pdf',
    disabledCategories: ['annotation', 'print', 'export'],
  }"
/>
```

Available categories include: `zoom`, `annotation`, `redaction`, `document`, `page`, `panel`, `tools`, `selection`, and `history`.

---

## ⚙️ Configuration Options

The `config` prop accepts the following top-level options:

| Option               | Type                                | Description                                    |
| :------------------- | :---------------------------------- | :--------------------------------------------- |
| `src`                | `string`                            | URL or path to the PDF document.               |
| `theme`              | `object`                            | Theme configuration (preference, overrides).   |
| `tabBar`             | `'always' \| 'multiple' \| 'never'` | Control visibility of the document tab bar.    |
| `disabledCategories` | `string[]`                          | Hide specific UI features by category.         |
| `i18n`               | `object`                            | Configure locales and translations.            |
| `annotations`        | `object`                            | Configure annotation defaults (author, tools). |
| `zoom`               | `object`                            | Configure default zoom levels and limits.      |
| `scroll`             | `object`                            | Configure scroll direction and logic.          |

---

## 🔌 Events & Registry

We emit standard Vue events for initialization and readiness.

```vue
<template>
  <PDFViewer :config="{ src: '/doc.pdf' }" @ready="onReady" />
</template>

<script setup>
function onReady(registry) {
  const engine = registry.getEngine();
  console.log('Engine ready:', engine);
}
</script>
```

### Available Events

- `@init` - Emitted when the viewer container is initialized.
- `@ready` - Emitted when the plugin registry is ready and plugins are loaded.

---

## 🧩 Headless Mode

Need complete control over the UI? Building a custom design system?

Check out our **Headless Composables** which provide reactive state and logic without the UI:

```bash
npm install @embedpdf/core @embedpdf/plugin-zoom ...
```

Read the [Headless Documentation](https://www.embedpdf.com/docs/vue/headless/introduction) for more details.

---

## 📄 License

EmbedPDF is [MIT licensed](https://github.com/embedpdf/embed-pdf-viewer/blob/main/LICENSE). Commercial use is welcome—just keep the copyright headers intact.
