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
import type { Engine, EngineFactory, OpenInput } from '@embedpdf/core';
import type { InitialDocument } from '@embedpdf/react';

export type EngineMode = 'local' | 'cloud';

export const engineMode: EngineMode =
  (new URLSearchParams(window.location.search).get('engine') as EngineMode | null) ?? 'local';

const DROID_FALLBACK_FONT = {
  key: 'droid-sans-fallback-full',
  familyName: 'Droid Sans Fallback',
  url: `${import.meta.env.BASE_URL}DroidSansFallbackFull.ttf`,
} as const;

/**
 * The engine RECIPE for the selected mode — a description, not a live engine.
 * Everything above it is engine-agnostic; this is the ONE place local vs cloud
 * is decided. Hand it straight to `<Viewer engine={...}>` (viewer-owned) or
 * wrap it with `deferredEngine()` to own the lifetime yourself.
 *
 * Note the local/cloud asymmetry the API makes explicit: `localEngine` takes a
 * `fallbackFonts` recipe (client-side runtime fonts); `cloudEngine` does not —
 * fallback fonts are a server policy there.
 */
export function selectedEngine(): EngineFactory {
  return async () => {
    if (engineMode === 'cloud') {
      // Same Engine contract, served over HTTP. Requires ee/server + a token.
      const { cloudEngine } = await import('@cloudpdf/engine');
      return cloudEngine({
        baseUrl: import.meta.env.VITE_CLOUDPDF_URL ?? 'http://127.0.0.1:3000',
        token: import.meta.env.VITE_CLOUDPDF_TOKEN,
      })();
    }
    // Local wasm engine in the default worker, CJK fallback font registered at boot.
    const { localEngine } = await import('@embedpdf/engine');
    return localEngine({ fallbackFonts: [DROID_FALLBACK_FONT] })();
  };
}

/** Boot the selected engine to a live instance (LayerLab / bootstrap use this). */
export async function createEngine(): Promise<Engine> {
  return selectedEngine()();
}

/**
 * The non-blocking, CALLER-OWNED boot: turn the recipe into a synchronously-
 * usable facade whose real boot (wasm worker, fonts) overlaps first render and
 * is only awaited inside `documents.open()`. Prefer passing `selectedEngine()`
 * straight to `<Viewer>` (viewer-owned); this exists for code paths that need
 * to hold the engine themselves.
 */
export function createDeferredEngine(): Engine {
  return deferredEngine(selectedEngine());
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
