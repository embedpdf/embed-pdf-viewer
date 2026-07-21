/**
 * The one place the engine is chosen. Local PDFium-wasm in a worker; the rest
 * of the app only speaks the engine-core `Engine` contract.
 *
 * `createEngine()` is synchronous and inert: the worker + WASM boot lazily
 * (kicked by the Viewer's `warmup()`), fonts are registered by the boot
 * pipeline before any document work — so the translated chrome renders at
 * t≈0 and only `documents.open()` awaits the engine.
 */
import type { Engine, OpenInput, InitialDocument } from '@embedpdf/react/runtime';
import { localEngine } from '@embedpdf/engine';
import EngineWorker from '@embedpdf/engine/worker-entry?worker';

/** A lazy bytes source: the tab appears at t≈0 (named), the fetch runs UNDER
 *  the loading tab, and all initial fetches run in parallel. */
const lazyBytes = (id: string, url: string) => async (): Promise<OpenInput> => ({
  kind: 'bytes',
  id,
  bytes: await fetchBytes(`${import.meta.env.BASE_URL}${url}`),
});

const DROID_FALLBACK_FONT = {
  key: 'droid-sans-fallback-full',
  familyName: 'Droid Sans Fallback',
  url: `${import.meta.env.BASE_URL}DroidSansFallbackFull.ttf`,
} as const;

export function createEngine(): Engine {
  return localEngine({
    // Vite `?worker` import — the snippet build keeps its own worker wiring
    // instead of the default portable worker. The thunk defers allocation to
    // the engine's lazy boot.
    worker: () => new EngineWorker(),
    fallbackFonts: [DROID_FALLBACK_FONT],
  });
}

export const fetchBytes = async (url: string): Promise<Uint8Array> =>
  fetch(url).then(async (response) => {
    if (!response.ok) throw new Error(`failed to fetch ${url}: ${response.status}`);
    return new Uint8Array(await response.arrayBuffer());
  });

/**
 * The default documents — more arrive via the tab bar's open-file button.
 * A plain synchronous list: every tab renders immediately (named, loading),
 * `active` picks the selected tab (default: the first), and the protected
 * document needs NO special config — it opens into the `locked` state and
 * the shell shows its password prompt.
 */
export const initialDocuments: InitialDocument[] = [
  { name: 'Ebook', source: lazyBytes('ebook', 'ebook.pdf') },
  { name: 'Form', source: lazyBytes('form', 'form.pdf') },
  {
    name: 'Interactive PDF Forms JavaScript Demo',
    source: lazyBytes('interactive', 'interactive_pdf_forms_javascript_demo.pdf'),
  },
  { name: 'I-140', source: lazyBytes('i-140', 'i-140.pdf') },
  { name: 'F1040', source: lazyBytes('f1040', 'f1040.pdf') },
  { name: 'Protected', source: lazyBytes('protected', 'demo_protected.pdf') },
];
