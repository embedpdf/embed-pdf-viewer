<div align="center">
  <a href="https://www.embedpdf.com">
    <img alt="EmbedPDF logo" src="https://www.embedpdf.com/logo-192.png" height="96">
  </a>

  <h1>EmbedPDF</h1>

  <!-- Badges -->

<a href="https://github.com/embedpdf/embed-pdf-viewer/blob/main/LICENSE"><img alt="License" src="https://img.shields.io/npm/l/@embedpdf/pdfium.svg?style=for-the-badge&labelColor=000000"></a>
<a href="https://github.com/embedpdf/embed-pdf-viewer/discussions"><img alt="Join the community on GitHub" src="https://img.shields.io/badge/Join%20the%20community-blueviolet.svg?style=for-the-badge&labelColor=000000"></a>

</div>

# Vue Quasar PDF Viewer Example

This example shows how to build a fully‑featured PDF viewer with **EmbedPDF**, **Vue 3** and **Quasar 2**. It demonstrates how to combine EmbedPDF’s plugin system with Quasar components to create a polished reading experience that feels right at home in any Vue + Quasar project.

- **Live demo:** _(coming soon)_
- **Docs:** [https://www.embedpdf.com](https://www.embedpdf.com)

---

## Key features on display

| Feature                                                    | Plugin(s)                                                                         |
| ---------------------------------------------------------- | --------------------------------------------------------------------------------- |
| Virtualised scrolling with smooth page rendering           | `@embedpdf/plugin-scroll` + `@embedpdf/plugin-render` + `@embedpdf/plugin-tiling` |
| Zoom controls (fit page, fit width, marquee zoom, presets) | `@embedpdf/plugin-zoom`                                                           |
| Pan/hand tool                                              | `@embedpdf/plugin-pan`                                                            |
| Rotate pages                                               | `@embedpdf/plugin-rotate`                                                         |
| Single and spread layouts                                  | `@embedpdf/plugin-spread`                                                         |
| In‑document text search                                    | `@embedpdf/plugin-search`                                                         |
| Thumbnail sidebar navigation                               | `@embedpdf/plugin-thumbnail`                                                      |
| Annotation tools (text, shapes, stamp)                     | `@embedpdf/plugin-annotation`                                                     |
| Redaction tools (text selection, marquee)                  | `@embedpdf/plugin-redaction`                                                      |
| File picker, download & print                              | `@embedpdf/plugin-loader`, `@embedpdf/plugin-export`, `@embedpdf/plugin-print`    |
| Fullscreen support                                         | `@embedpdf/plugin-fullscreen`                                                     |

The UI around these plugins is built with Quasar’s `QHeader`, `QDrawer`, `QMenu`, `QBtn`, and companion components. On mobile, the side drawers collapse into a bottom-sheet style `QDialog` for a more native feel.

---

## Quick start

> **Prerequisites**
>
> - Node 18 or newer
> - **pnpm** 10 (recommended) or a recent pnpm 8/9

1.  **Clone the repo** (or your fork) and install dependencies:

    ```bash
    git clone https://github.com/embedpdf/embed-pdf-viewer.git
    cd embed-pdf-viewer
    pnpm install
    ```

2.  **Build the core packages** once so that the example can import them:

    ```bash
    pnpm run build --filter "./packages/*"
    # or keep them rebuilt automatically while you work:
    pnpm watch build --filter "./packages/*"
    ```

3.  **Run the example dev server**:

    ```bash
    pnpm --filter @embedpdf/example-vue-quasar run dev
    ```

    Vite will start on [http://localhost:3000](http://localhost:3000) and open the browser automatically.

---

## Building a production bundle

To create an optimized build (under `examples/vue-quasar/dist`):

```bash
pnpm --filter @embedpdf/example-vue-quasar run build
```

The output is a static site you can deploy to any CDN or static host.

---

## Folder layout

```
examples/vue-quasar
├── public/              # Static assets (favicon)
└── src/
    ├── components/      # Quasar‑based UI parts (Toolbar, Search, …)
    │   └── drawer-system/ # Reusable logic for side drawers/bottom sheets
    ├── plugins/         # Quasar plugin setup
    ├── App.vue          # Root Vue component
    ├── Application.vue  # Main viewer shell and plugin wiring
    └── main.ts          # Vue entry + theming
```

The PDFium WebAssembly bundle is loaded automatically by the `usePdfiumEngine` hook in `src/Application.vue`, which passes it to EmbedPDF’s **WebWorkerEngine**.

---

## Customisation tips

- **Swap icons or colours:** The UI uses standard Quasar components and props, so styling tweaks are straightforward.
- **Add or remove plugins:** Open `src/Application.vue` and edit the `plugins` array.

For deep dives, check the [EmbedPDF documentation](https://www.embedpdf.com) and the source of this example.

---

## License

Example code is released under the MIT license, the same as EmbedPDF itself.
