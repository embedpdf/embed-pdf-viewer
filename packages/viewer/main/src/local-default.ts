/**
 * Registers the built-in LOCAL engine as the default (side-effect module,
 * imported by `src/index.ts` — deliberately NOT by `src/core.ts`).
 *
 * This is the one place the local engine enters the viewer's runtime module
 * graph. Builds that always inject an engine (the cloud snippet) bundle the
 * `core` entry instead and structurally exclude PDFium: no wasm, no worker
 * source, no stub surgery.
 */
import { localEngine } from '@embedpdf/engine';

import type { LocalEngineConfig } from './config';
import { getSnippetWasmUrl, setDefaultEngineProvider } from './runtime-defaults';

setDefaultEngineProvider((option: unknown) => {
  const local: LocalEngineConfig = { ...(option as LocalEngineConfig | undefined) };
  // When the snippet entry registered a self-located wasm default and the
  // config names no wasm source of its own, the sibling `pdfium.wasm` wins
  // over the engine's bundler-default resolution.
  const snippetWasmUrl = getSnippetWasmUrl();
  if (snippetWasmUrl && !local.wasmUrl && !local.wasmBinary && !local.assetsUrl) {
    local.wasmUrl = snippetWasmUrl;
  }
  // A thunk, so the viewer owns the engine's lifetime.
  return () => localEngine(local);
});
