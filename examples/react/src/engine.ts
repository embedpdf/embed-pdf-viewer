/**
 * The ONE place an engine is chosen. Everything else in the app is engine-agnostic
 * — it only speaks the @embedpdf/engine-core `Engine` contract, so swapping the
 * implementation here changes nothing above it.
 *
 * Pick with ?engine=local|cloud  (default: local wasm)
 *   local — @embedpdf/engine: PDFium wasm in a Worker thread (real rendering)
 *   cloud — @cloudpdf/engine: the same contract over HTTP (needs a running server)
 */
import { deferredEngine } from '@embedpdf/core';
import type { Engine, OpenInput } from '@embedpdf/core';
import type { InitialDocument } from '@embedpdf/react';

export type EngineMode = 'local' | 'cloud';

export const engineMode: EngineMode =
  (new URLSearchParams(window.location.search).get('engine') as EngineMode | null) ?? 'local';

const DROID_FALLBACK_FONT = {
  key: 'droid-sans-fallback-full',
  familyName: 'Droid Sans Fallback',
  url: `${import.meta.env.BASE_URL}DroidSansFallbackFull.ttf`,
} as const;

export async function createEngine(): Promise<Engine> {
  switch (engineMode) {
    case 'cloud': {
      // Same Engine contract, served over HTTP. Requires ee/server + a token.
      const { createCloudEngine } = await import('@cloudpdf/engine');
      return createCloudEngine({
        baseUrl: import.meta.env.VITE_CLOUDPDF_URL ?? 'http://127.0.0.1:3000',
        token: import.meta.env.VITE_CLOUDPDF_TOKEN,
      });
    }
    case 'local':
    default: {
      const { createLocalEngineWithWorker } = await import('@embedpdf/engine');
      const { default: EngineWorker } = await import('@embedpdf/engine/worker-entry?worker');
      const engine = await createLocalEngineWithWorker({ worker: new EngineWorker() });
      await registerFallbackFonts(engine);
      return engine;
    }
  }
}

/**
 * The non-blocking boot: kick the real boot off NOW (wasm worker, fonts) and
 * hand back a synchronously-usable facade. The kernel — and the translated
 * shell — never wait for it; the boot overlaps with first render and is only
 * awaited inside `documents.open()`.
 */
export function createDeferredEngine(): Engine {
  const booting = createEngine();
  return deferredEngine(() => booting);
}

async function registerFallbackFonts(engine: Engine): Promise<void> {
  if (!engine.fonts) {
    if (engineMode === 'local') {
      throw new Error('local engine did not expose engine.fonts for fallback font registration');
    }
    return;
  }

  console.info(`[embedpdf-v3] loading fallback font: ${DROID_FALLBACK_FONT.url}`);
  const data = await fetchBytes(DROID_FALLBACK_FONT.url);
  const handle = await engine.fonts.register({
    key: DROID_FALLBACK_FONT.key,
    familyName: DROID_FALLBACK_FONT.familyName,
    data,
  });
  await engine.fonts.addFallback(handle);
  console.info(`[embedpdf-v3] registered fallback font: ${handle.key} (${data.byteLength} bytes)`);
}

// Sample documents shipped in /public. For cloud they'd address server documents
// by id/token instead of carrying bytes.
export const SAMPLES: ReadonlyArray<{ id: string; name: string; url: string }> = [
  { id: 'ebook', name: 'Ebook', url: '/ebook.pdf' },
  { id: 'ebook1', name: 'Ebook Annotated', url: '/ebook-annotated.pdf' },
  { id: 'ebook2', name: 'Ebook Rotated', url: '/ebook-rotated.pdf' },
  { id: 'mixed sizes', name: 'Mixed Sizes', url: '/mixed_page_sizes_test.pdf' },
  { id: 'report', name: 'Whitepaper', url: '/report.pdf' },
  { id: 'manual', name: 'Manual', url: '/manual.pdf' },
  { id: 'form-sample', name: 'Form (fields)', url: '/form-sample.pdf' },
  { id: 'form-listbox', name: 'Form (listbox)', url: '/form-listbox.pdf' },
];

export const fetchBytes = async (url: string): Promise<Uint8Array> =>
  fetch(url).then(async (response) => {
    if (!response.ok) {
      throw new Error(`failed to fetch ${url}: ${response.status} ${response.statusText}`);
    }
    return new Uint8Array(await response.arrayBuffer());
  });

export async function loadInitialDocuments(): Promise<InitialDocument[]> {
  if (engineMode === 'cloud') {
    return SAMPLES.map(({ id, name }) => ({ source: { kind: 'id', id } as OpenInput, name }));
  }
  return Promise.all(
    SAMPLES.map(async ({ id, name, url }) => ({
      source: { kind: 'bytes', id, bytes: await fetchBytes(url) } as OpenInput,
      name,
    })),
  );
}

export interface Boot {
  engine: Engine;
  documents: InitialDocument[];
}

export async function bootstrap(): Promise<Boot> {
  const engine = await createEngine();
  const documents = await loadInitialDocuments();
  return { engine, documents };
}

let untitledSeq = 0;
export async function newDocument(): Promise<InitialDocument> {
  untitledSeq += 1;
  const id = `untitled-${untitledSeq}-${Math.round(performance.now())}`;
  const source: OpenInput =
    engineMode === 'cloud'
      ? { kind: 'id', id: 'manual' }
      : { kind: 'bytes', id, bytes: await fetchBytes('/manual.pdf') };
  return { source, name: `Untitled ${untitledSeq}` };
}
