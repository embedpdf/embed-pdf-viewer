/**
 * The ONE place an engine is chosen — everything above speaks the engine-core
 * `Engine` contract only. `deferredEngine` makes the boot non-blocking: the
 * WASM worker spins up in the background and is only awaited inside
 * `documents.open()`, so the shell renders at t≈0.
 */
import { deferredEngine } from '@embedpdf/angular/runtime';
import type { Engine, OpenInput } from '@embedpdf/angular/runtime';

export function createEngine(): Engine {
  return deferredEngine(() => boot());
}

async function boot(): Promise<Engine> {
  const { createLocalEngineWithWorker } = await import('@embedpdf/engine');
  const worker = new Worker(new URL('./engine.worker', import.meta.url), { type: 'module' });
  return createLocalEngineWithWorker({ worker });
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
