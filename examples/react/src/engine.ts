/**
 * The ONE place an engine is chosen. Everything else in the app is engine-agnostic
 * — it only speaks the @embedpdf/engine-core `Engine` contract, so swapping the
 * implementation here changes nothing above it.
 *
 * Pick with ?engine=local|cloud  (default: local wasm)
 *   local — @embedpdf/engine: PDFium wasm in a Worker thread (real rendering)
 *   cloud — @cloudpdf/engine: the same contract over HTTP (needs a running server)
 */
import type { Engine, OpenInput } from '@embedpdf/core';
import type { InitialDocument } from '@embedpdf/react';
import { localEngine } from '@embedpdf/engine';
import { cloudEngine } from '@cloudpdf/engine';

export type EngineMode = 'local' | 'cloud';

export const engineMode: EngineMode =
  (new URLSearchParams(window.location.search).get('engine') as EngineMode | null) ?? 'local';

const DROID_FALLBACK_FONT = {
  key: 'droid-sans-fallback-full',
  familyName: 'Droid Sans Fallback',
  url: `${import.meta.env.BASE_URL}DroidSansFallbackFull.ttf`,
} as const;

/**
 * Construct the engine for the selected mode. Everything above it is
 * engine-agnostic; this is the ONE place local vs cloud is decided.
 *
 * Construction is synchronous and inert — no worker, no WASM until first use —
 * so calling this is free. Ownership follows how you hand it to the Viewer:
 * pass the THUNK (`engine={selectedEngine}`) and the Viewer owns the engine it
 * creates (destroyed on unmount); call it yourself and pass the INSTANCE to
 * share one caller-owned engine.
 *
 * Note the local/cloud asymmetry the API makes explicit: `localEngine` takes a
 * `fallbackFonts` config (client-side runtime fonts); `cloudEngine` does not —
 * fallback fonts are a server policy there.
 */
export function selectedEngine(): Engine {
  if (engineMode === 'cloud') {
    // Same Engine contract, served over HTTP. Requires cloudpdf/server + a token.
    return cloudEngine({
      baseUrl: import.meta.env.VITE_CLOUDPDF_URL ?? 'http://127.0.0.1:3000',
      token: import.meta.env.VITE_CLOUDPDF_TOKEN,
    });
  }
  // Local wasm engine in the default worker, CJK fallback font registered at boot.
  return localEngine({ fallbackFonts: [DROID_FALLBACK_FONT] });
}

/** A live caller-owned instance (LayerLab / bootstrap use this). */
export function createEngine(): Engine {
  return selectedEngine();
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
  const engine = createEngine();
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
