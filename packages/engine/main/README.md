# @embedpdf/engine

The EmbedPDF local engine: [EmbedPDF Runtime](https://github.com/embedpdf/runtime)
(our fork of PDFium) compiled to WebAssembly, running inside a
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

- The workers (`workers/embedpdf-worker.js`, `workers/encoder-worker.js`) and
  `embedpdf.wasm` are files your bundler (webpack 5/Next, Vite, Turbopack,
  Rspack, Parcel 2) emits into your own build, so `worker-src 'self'` covers
  them. Where the engine's scripts are on another origin than the page, the
  workers start from `blob:` URLs instead.
- Toolchains that can't emit the files (Angular's application builder, plain
  esbuild) use `@embedpdf/engine/portable`: the wasm as a lazy chunk, the
  workers from `blob:` URLs.
- Every worker URL goes through one Trusted Types policy, `embedpdf`.

## Self-hosting and strict CSP

Everything is overridable through `LocalEngineRecipeOptions`:

```ts
localEngine({
  assetsUrl: '/embedpdf/', // self-hosted embedpdf.wasm directory
  worker: '/embedpdf/embedpdf-worker.js', // a copied worker; finds embedpdf.wasm beside it
  encoderWorker: '/embedpdf/encoder-worker.js',
});
```

- Copy `workers/embedpdf-worker.js`, `workers/encoder-worker.js` and
  `embedpdf.wasm` from this package into one served directory for a complete
  self-hosted, CSP-clean setup.
- `wasmBinary` accepts pre-fetched bytes for fully air-gapped deployments
  (explicit sources never contact a CDN).

## Documentation

Full guides and API reference: https://www.embedpdf.com/docs

## License

Apache-2.0
