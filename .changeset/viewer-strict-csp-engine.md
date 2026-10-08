---
'@embedpdf/engine': minor
---

The engine's workers start from files of your build by default: `localEngine()` points your bundler at `workers/embedpdf-worker.js` and `workers/encoder-worker.js`, which webpack 5, Vite, Rspack, Parcel and Turbopack emit beside your code, so `worker-src 'self'` covers them and no `blob:` URL is needed. Where the engine's scripts are on another origin than the page (loaded from a CDN), the workers start from `blob:` URLs, since a browser starts a worker only from the page's own origin. `worker: 'inline'` and `encoderWorker: 'inline'` still ask for the `blob:` delivery; `@embedpdf/engine/portable` uses it, as its toolchains cannot emit the files.

Every worker URL goes through one Trusted Types policy named `embedpdf`, which passes only the engine's own worker files, the `blob:` URLs it makes and the `worker` / `encoderWorker` URLs you configure, so a page with `require-trusted-types-for 'script'` needs only `trusted-types embedpdf`. Two copies of the engine on one page share the policy.

The worker files are exported as `@embedpdf/engine/workers/embedpdf-worker.js` and `@embedpdf/engine/workers/encoder-worker.js`, and `embedpdf-worker.js` no longer contains `import.meta`, so it runs as a module or a classic script alike. `resolveInlineWasmSource` is renamed `resolveDefaultWasmSource`.
