import type { PdfRuntimeModule } from '@embedpdf/engine-runtime';

const initialized = new WeakSet<PdfRuntimeModule>();

/**
 * Initialize the thread-confined PDFium runtime for the calling thread. Each
 * worker thread owns its own PDFium state, so this must run on every thread
 * that uses the runtime. Safe to call multiple times.
 */
export function ensureInitialized(runtime: PdfRuntimeModule): void {
  if (initialized.has(runtime)) return;
  runtime.fn.EPDF_InitThread();
  initialized.add(runtime);
}

/**
 * Tear down PDFium for the calling thread. Lifecycle-strict: every PDFium
 * handle created on this thread must already be closed.
 */
export function destroyLibrary(runtime: PdfRuntimeModule): void {
  if (!initialized.has(runtime)) return;
  runtime.fn.EPDF_ShutdownThread();
  initialized.delete(runtime);
}
