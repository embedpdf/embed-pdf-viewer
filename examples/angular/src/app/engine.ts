/**
 * The ONE place an engine is chosen — everything above speaks the engine-core
 * `Engine` contract only. `createLocalEngineWithWorker` constructs
 * synchronously and boots lazily (the host's `warmup()` kicks it off in the
 * background), so the shell renders at t≈0 and only `documents.open()` awaits
 * the engine.
 */
import type { Engine, OpenInput } from '@embedpdf/angular/runtime';
import { createLocalEngineWithWorker } from '@embedpdf/engine';

export function createEngine(): Engine {
  return createLocalEngineWithWorker({
    // Thunk: the Worker allocates when the engine boots, not at construction.
    worker: () => new Worker(new URL('./engine.worker', import.meta.url), { type: 'module' }),
  });
}

export const fetchBytes = async (url: string): Promise<Uint8Array> => {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`failed to fetch ${url}: ${response.status} ${response.statusText}`);
  }
  return new Uint8Array(await response.arrayBuffer());
};

/** The local engine opens BYTES (no URL kind) — fetch, then hand over. */
export async function sampleSource(id: string, url: string): Promise<OpenInput> {
  return { kind: 'bytes', id, bytes: await fetchBytes(url) };
}
