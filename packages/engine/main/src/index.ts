/**
 * @embedpdf/engine - Engine v3 local implementation.
 *
 * Public API:
 *   createLocalEngine()                 -> LocalEngine using inline transport
 *   createLocalEngineWithWorker(worker) -> LocalEngine using a Web Worker
 *
 * Both implementations satisfy the same Engine interface from
 * @embedpdf/engine-core.
 */
import { createPdfRuntime, type CreatePdfRuntimeOptions } from '@embedpdf/engine-runtime';

import { LocalEngine, type LocalEngineOptions } from './LocalEngine';
import { BrowserWorkerTransport } from './transport/BrowserWorkerTransport';
import { InlineTransport } from './transport/InlineTransport';

export { LocalEngine } from './LocalEngine';
export type { LocalEngineOptions } from './LocalEngine';
export type { Transport } from './transport/Transport';
export { InlineTransport } from './transport/InlineTransport';
export { BrowserWorkerTransport } from './transport/BrowserWorkerTransport';
export { Priority } from './worker/Priority';
export type { WorkerRequest, WorkerResponse } from './worker/protocol';
export { LocalDocumentHandle } from './document/LocalDocumentHandle';
export { LocalDocumentAnnotationsService } from './document/LocalDocumentAnnotationsService';
export { LocalDocumentPagesService } from './document/LocalDocumentPagesService';
export { LocalPageHandle } from './document/LocalPageHandle';
export { LocalPageAnnotationsService } from './document/LocalPageAnnotationsService';
export { LocalPageGeometryService } from './document/LocalPageGeometryService';
export { LocalPageRenderService } from './document/LocalPageRenderService';
export { BrowserImageEncoder } from './render/BrowserImageEncoder';
export type { LocalImageEncoder } from './render/BrowserImageEncoder';
export { LocalFontService } from './fonts/LocalFontService';

export interface CreateLocalEngineOptions extends Omit<LocalEngineOptions, 'transport'> {
  /** Forwarded to @embedpdf/engine-runtime when no transport is provided. */
  runtime?: CreatePdfRuntimeOptions;
}

/**
 * Create a LocalEngine that runs PDFium inline in the current thread.
 * Suitable for Node, tests, and as a worker-less browser fallback.
 */
export async function createLocalEngine(opts: CreateLocalEngineOptions = {}): Promise<LocalEngine> {
  const runtime = await createPdfRuntime(opts.runtime ?? {});
  const transport = new InlineTransport(runtime);
  return LocalEngine.fromTransport({ transport, concurrency: opts.concurrency });
}

export interface CreateLocalEngineWithWorkerOptions extends Omit<LocalEngineOptions, 'transport'> {
  worker: Worker;
}

/**
 * Create a LocalEngine that talks to an existing Web Worker. The worker
 * must be wired up to engine-local's worker-entry (see src/worker/worker-entry.ts).
 */
export async function createLocalEngineWithWorker(
  opts: CreateLocalEngineWithWorkerOptions,
): Promise<LocalEngine> {
  const transport = await BrowserWorkerTransport.spawn(opts.worker);
  return LocalEngine.fromTransport({ transport, concurrency: opts.concurrency });
}
