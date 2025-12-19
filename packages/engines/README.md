<div align="center">
  <a href="https://www.embedpdf.com">
    <img alt="EmbedPDF logo" src="https://www.embedpdf.com/logo-192.png" height="96">
  </a>
  <h1>EmbedPDF</h1>

<a href="https://www.npmjs.com/package/@embedpdf/engines"><img alt="NPM version" src="https://img.shields.io/npm/v/@embedpdf/engines.svg?style=for-the-badge&labelColor=000000"></a> <a href="https://github.com/embedpdf/embed-pdf-viewer/blob/main/packages/engines/LICENSE"><img alt="License" src="https://img.shields.io/npm/l/@embedpdf/engines.svg?style=for-the-badge&labelColor=000000"></a> <a href="https://github.com/embedpdf/embed-pdf-viewer/discussions"><img alt="Join the community on GitHub" src="https://img.shields.io/badge/Join%20the%20community-blueviolet.svg?style=for-the-badge&labelColor=000000"></a>

</div>

# @embedpdf/engines

Pluggable rendering engines for EmbedPDF. Ships with **`PdfiumNative`** (low-level executor) and **`PdfEngine`** (high-level orchestrator) – a promise‑first API built on top of `@embedpdf/pdfium`.

## Documentation

For complete guides, examples, and full API reference, visit:

**[Official Documentation](https://www.embedpdf.com/docs/engines/introduction)**

## Why `@embedpdf/engines`?

- **High‑level abstraction** – handles tasks, DPR scaling, annotation colour resolution, range/linearised loading.
- **Universal runtimes** – works in browsers, Node, and serverless environments.
- **Typed & composable** – 100 % TypeScript with generics for custom image pipelines.

## Features

- Open PDFs from `ArrayBuffer` or URL
- Render full pages, arbitrary rectangles, thumbnails – all DPI‑aware
- Text extraction, glyph geometry, word‑break‑aware search with context windows
- Read / create / transform / delete **annotations** and **form fields**
- Page ops: merge, extract, flatten, partial import
- Attachments & digital‑signature introspection

## Installation

```bash
npm install @embedpdf/engines @embedpdf/pdfium
```

## Basic Usage

```typescript
import { init } from '@embedpdf/pdfium';
import { PdfiumNative, PdfEngine } from '@embedpdf/engines/pdfium';
import { browserImageDataToBlobConverter } from '@embedpdf/engines/converters';

const pdfiumWasm =
  'https://cdn.jsdelivr.net/npm/@embedpdf/pdfium/dist/pdfium.wasm';

(async () => {
  const response = await fetch(pdfiumWasm);
  const wasmBinary = await response.arrayBuffer();

  // 1 – boot the low‑level WASM module
  const pdfiumModule = await init({ wasmBinary });

  // 2 – create the native executor (initializes PDFium automatically)
  const native = new PdfiumNative(pdfiumModule);

  // 3 – create the orchestrator with image converter
  const engine = new PdfEngine(native, {
    imageConverter: browserImageDataToBlobConverter,
  });

  // 4 – open & render
  const doc = await engine
    .openDocumentUrl({ id: 'demo', url: '/demo.pdf' })
    .toPromise();
  const page0 = doc.pages[0];

  const blob = await engine.renderPage(doc, page0).toPromise();
})();
```

## Learn More

Head over to our docs for:

- **Getting Started** – initialise, render, destroy
- **Engine Interface** – implement your own back‑end
- **Advanced Topics** – workers, Node pipelines, Sharp image adapters

## License

MIT – see the [LICENSE](https://github.com/embedpdf/embed-pdf-viewer/blob/main/packages/engines/LICENSE) file.
