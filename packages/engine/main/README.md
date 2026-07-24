# @embedpdf/engine

The EmbedPDF local engine: PDFium compiled to WebAssembly, running inside a
Web Worker, speaking the Engine v3 interface — the same contract as the
[`@cloudpdf/engine`](https://www.npmjs.com/package/@cloudpdf/engine) cloud client.

```bash
npm install @embedpdf/engine
```

```ts
import { localEngine } from '@embedpdf/engine';

const engine = localEngine(); // synchronous, allocates nothing yet

const document = await engine.open({
  kind: 'url',
  id: 'doc',
  url: '/report.pdf',
});
const { pageCount } = await document.pages.list();
await document.close();
await engine.destroy();
```

## Zero configuration

`localEngine()` needs no wasm or worker wiring:

- The worker ships inside this package and spawns from a blob URL.
- `pdfium.wasm` resolves sibling-first: your bundler (webpack 5/Next, Vite,
  Turbopack, Rspack, Parcel 2) emits it into your own build. Toolchains that
  can't are caught by a version-pinned CDN fallback (a console warning tells
  you when that happens and how to self-host).

## Self-hosting and strict CSP

Everything is overridable through `LocalEngineRecipeOptions`:

```ts
localEngine({
  assetsUrl: '/embedpdf/', // self-hosted pdfium.wasm directory
  worker: '/embedpdf/pdfium-worker.js', // same-origin worker for strict CSP
});
```

- Copy `workers/pdfium-worker.js` and `pdfium.wasm` from this package into one
  served directory for a complete self-hosted, CSP-clean setup.
- `wasmBinary` accepts pre-fetched bytes for fully air-gapped deployments
  (explicit sources never contact a CDN).

## Documentation

Full guides and API reference: https://www.embedpdf.com/docs

## License

Apache-2.0
