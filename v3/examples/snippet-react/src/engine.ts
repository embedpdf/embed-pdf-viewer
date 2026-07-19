/**
 * The one place the engine is chosen. Local PDFium-wasm in a worker; the rest
 * of the app only speaks the engine-core `Engine` contract.
 *
 * `createDeferredEngine()` returns a synchronously-usable facade and kicks the
 * real boot (wasm worker, fonts) off in the background — so the translated
 * chrome renders at t≈0 and only `documents.open()` awaits the engine.
 */
import { deferredEngine } from '@embedpdf-x/react/runtime';
import type { Engine, OpenInput, InitialDocument } from '@embedpdf-x/react/runtime';

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

export async function createEngine(): Promise<Engine> {
  const { createLocalEngineWithWorker } = await import('@embedpdf/engine');
  const { default: EngineWorker } = await import('@embedpdf/engine/worker-entry?worker');
  const engine = await createLocalEngineWithWorker({ worker: new EngineWorker() });
  await registerFallbackFonts(engine);
  return engine;
}

export function createDeferredEngine(): Engine {
  const booting = createEngine();
  return deferredEngine(() => booting);
}

async function registerFallbackFonts(engine: Engine): Promise<void> {
  if (!engine.fonts) return;
  try {
    const data = await fetchBytes(DROID_FALLBACK_FONT.url);
    const handle = await engine.fonts.register({
      key: DROID_FALLBACK_FONT.key,
      familyName: DROID_FALLBACK_FONT.familyName,
      data,
    });
    await engine.fonts.addFallback(handle);
  } catch (error) {
    console.warn('[snippet-react] fallback font not registered:', error);
  }
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
