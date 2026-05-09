<div align="center">
  <a href="https://www.embedpdf.com/angular-pdf-viewer">
    <img alt="EmbedPDF logo" src="https://www.embedpdf.com/logo-192.png" height="96">
  </a>

  <h1>Angular PDF Viewer</h1>
  <p>The easiest way to embed PDF files in your Angular 21+ application with a complete, ready‑to‑use interface.</p>

<a href="https://www.embedpdf.com/angular-pdf-viewer"><img alt="Documentation" src="https://img.shields.io/badge/View%20Docs-0af?style=for-the-badge&labelColor=000000"></a>
<a href="https://app.embedpdf.com/"><img alt="Live Demo" src="https://img.shields.io/badge/Try%20Live%20Demo-ff1493.svg?style=for-the-badge&labelColor=000000"></a>
<a href="https://www.npmjs.com/package/@embedpdf/angular-pdf-viewer"><img alt="NPM Version" src="https://img.shields.io/npm/v/@embedpdf/angular-pdf-viewer?style=for-the-badge&labelColor=000000&color=blue"></a>

</div>

---

## 📚 Documentation

The full walkthrough, advanced examples, and API reference live in our docs site:

👉 **[https://www.embedpdf.com/angular-pdf-viewer](https://www.embedpdf.com/angular-pdf-viewer)**

---

## 🚀 Introduction

The `@embedpdf/angular-pdf-viewer` package provides a complete, production-ready PDF viewing experience for Angular 21+ applications.

It is designed to be the fastest way to get a high-quality PDF viewer into your app. You don't need to build toolbars, handle layout logic, or worry about CSS—it just works.

### Key Features

- **Ready-to-use UI** — Includes a polished toolbar, sidebar, and thumbnails.
- **Responsive** — Adapts seamlessly to mobile and desktop screens.
- **Themable** — Built-in light/dark modes and support for custom brand colors.
- **App-wide defaults** — Configure viewer defaults once with Angular providers, then override per viewer when needed.
- **App-wide defaults** — Configure viewer defaults once with Angular providers,
  then override per viewer when needed.
  The `@embedpdf/angular-pdf-viewer` package provides a complete,
  production-ready PDF viewing experience for Angular 21+ applications.
- **Configurable** — Easily disable features you don't need (e.g., printing or downloading).
- **TypeScript** — Fully typed for a great developer experience.
- **Standalone** — Pure standalone component; no NgModules needed.
- **Zoneless ready** — Uses signal inputs/outputs and `OnPush` change detection.

---

## 📦 Installation

```bash
npm install @embedpdf/angular-pdf-viewer
# or
pnpm add @embedpdf/angular-pdf-viewer
# or
yarn add @embedpdf/angular-pdf-viewer
```

Requires Angular `>=21.0.0` as a peer dependency.

---

## 🛠 Basic Usage

Import the `PDFViewer` component and render it with a PDF source.

```ts
import { Component } from '@angular/core';
import { PDFViewer } from '@embedpdf/angular-pdf-viewer';

@Component({
  selector: 'app-root',
  imports: [PDFViewer],
  template: `
    <embedpdf-pdf-viewer
      [config]="{
        src: 'https://snippet.embedpdf.com/ebook.pdf',
        theme: { preference: 'light' },
      }"
      style="display:block;height:100vh"
    />
  `,
})
export class AppComponent {}
```

That's it! You now have a fully functional PDF viewer.

---

## 🧱 Global Defaults with Angular Providers

If your app renders multiple viewers, you can configure shared defaults once with
`provideEmbedPdfViewerConfig()` and still override them per component via `[config]`.

This is the Angular-idiomatic way to define viewer defaults at the app, route, or
component subtree level.

For almost all apps, prefer `provideEmbedPdfViewerConfig(...)`. The lower-level
`EMBEDPDF_VIEWER_DEFAULT_CONFIG` token is also exported for advanced DI scenarios,
but the provider function is the recommended public API.

```ts
import { bootstrapApplication } from '@angular/platform-browser';
import {
  provideEmbedPdfViewerConfig,
  type PDFViewerConfig,
} from '@embedpdf/angular-pdf-viewer';
import { AppComponent } from './app/app.component';

const viewerDefaults = {
  disabledCategories: ['annotation'],
  theme: {
    preference: 'dark',
    light: {
      accent: { primary: '#dd0031' },
    },
    dark: {
      accent: { primary: '#ff5c7c' },
    },
  },
} satisfies PDFViewerConfig;

bootstrapApplication(AppComponent, {
  providers: [...provideEmbedPdfViewerConfig(viewerDefaults)],
});
```

Then each viewer can provide only its instance-specific config:

```ts
import { Component } from '@angular/core';
import { PDFViewer } from '@embedpdf/angular-pdf-viewer';

@Component({
  selector: 'app-root',
  imports: [PDFViewer],
  template: `
    <embedpdf-pdf-viewer
      [config]="{
        src: '/document.pdf',
        theme: { preference: 'light' },
      }"
      style="display:block;height:100vh"
    />
  `,
})
export class AppComponent {}
```

### Scoped Defaults

Because this uses Angular DI, you can scope different defaults to different parts of
your app:

- **Application scope** — add the provider in `bootstrapApplication()`
- **Route scope** — add the provider in a route's `providers` array
- **Component subtree scope** — add the provider in a component's `providers` array

Nested providers merge with parent defaults, so a feature area can refine the app-wide
defaults without replacing them entirely.

### Precedence

Configuration is resolved in this order:

1. EmbedPDF built-in defaults
2. Parent `provideEmbedPdfViewerConfig(...)` defaults
3. Nearest `provideEmbedPdfViewerConfig(...)` defaults
4. The component's `[config]` input

The closest value wins.

### Merge Behavior

Provider defaults and local `[config]` are merged using predictable rules:

- **Objects** are deep-merged
- **Arrays** are replaced, not concatenated
- **Primitive values** (`string`, `number`, `boolean`, etc.) replace parent values
- **`undefined`** means “inherit the parent/default value”

This is especially useful for nested configuration like `theme`, `i18n`, and other
viewer option objects.

---

## 🎨 Customization

### Theme

The viewer includes a robust theming system. You can set the preference to `'light'`, `'dark'`, or `'system'`, and even override specific colors to match your brand.
The viewer includes a robust theming system. You can set the preference to
`'light'`, `'dark'`, or `'system'`, and even override specific colors to match
your brand.

```ts
@Component({
  template: `
    <embedpdf-pdf-viewer
      [config]="{
        src: '/document.pdf',
        theme: {
          preference: 'system',
          light: {
            accent: { primary: '#dd0031' }, // Custom brand color (Angular Red)
          },
        },
      }"
      style="display:block;height:100vh"
    />
  `,
})
```

### Disabling Features

Easily customize the UI by disabling features you don't need via the `disabledCategories` option:
Easily customize the UI by disabling features you don't need via the
`disabledCategories` option:

```ts
config = {
  src: '/document.pdf',
  disabledCategories: ['annotation', 'print', 'export'],
};
```

Available categories include: `zoom`, `annotation`, `redaction`, `document`, `page`, `panel`, `tools`, `selection`, and `history`.

If you're using `provideEmbedPdfViewerConfig(...)`, `disabledCategories` is a good
candidate for shared defaults. You can define a baseline set globally and replace it
per viewer when a specific screen needs a different UI surface.

---

## ⚙️ Configuration Options

The `config` input accepts the following top-level options:

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

When used together, `provideEmbedPdfViewerConfig(...)` supplies the defaults and the
`config` input provides per-instance overrides.

---

## 🔌 Events & Registry

We emit standard Angular outputs for initialization and readiness.

```ts
import { Component } from '@angular/core';
import {
  PDFViewer,
  type EmbedPdfContainer,
  type PluginRegistry,
} from '@embedpdf/angular-pdf-viewer';

@Component({
  selector: 'app-root',
  imports: [PDFViewer],
  template: `
    <embedpdf-pdf-viewer
      [config]="{ src: '/doc.pdf' }"
      (ready)="onReady($event)"
      style="display:block;height:100vh"
    />
  `,
})
export class AppComponent {
  onReady(registry: PluginRegistry) {
    const engine = registry.getEngine();
    console.log('Engine ready:', engine);
  }
}
```

### Available Outputs

- `(init)` — Emitted when the viewer container is initialized.
- `(ready)` — Emitted when the plugin registry is ready and plugins are loaded.

---

## 🧩 Headless Mode

Need complete control over the UI? Building a custom design system?

Headless Angular composables (per-plugin `/angular` subpaths with `inject*` signal-based state) are the next milestone — see the [Angular integration PRD](https://github.com/embedpdf/embed-pdf-viewer/issues/1) for the roadmap.

---

## 📄 License

EmbedPDF is [MIT licensed](https://github.com/embedpdf/embed-pdf-viewer/blob/main/LICENSE). Commercial use is welcome—just keep the copyright headers intact.
