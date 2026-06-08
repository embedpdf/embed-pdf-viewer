import { ignore, Logger, PdfEngine } from '@embedpdf/models';
import type { FontFallbackConfig } from '@embedpdf/engines';

const defaultWasmUrl =
  'https://cdn.jsdelivr.net/npm/@embedpdf/pdfium@__PDFIUM_VERSION__/dist/pdfium.wasm';

export interface UsePdfiumEngineProps {
  wasmUrl?: string;
  worker?: boolean;
  logger?: Logger;
  /**
   * Font fallback configuration for handling missing fonts in PDFs.
   */
  fontFallback?: FontFallbackConfig;
  /** URL to the PDFium worker script. Avoids `worker-src blob:` in strict CSP. */
  workerUrl?: string;
  /** URL to the image encoder worker script. Avoids `worker-src blob:` in strict CSP. */
  encoderWorkerUrl?: string;
}

export function usePdfiumEngine(config?: UsePdfiumEngineProps) {
  const { wasmUrl = defaultWasmUrl, worker = true, logger, fontFallback, workerUrl, encoderWorkerUrl } = config ?? {};

  // Create a reactive state object
  const state = $state({
    engine: null as PdfEngine | null,
    isLoading: true,
    error: null as Error | null,
  });

  let engineRef = $state<PdfEngine | null>(null);

  const isBrowser = typeof window !== 'undefined';

  if (isBrowser) {
    $effect(() => {
      let cancelled = false;

      (async () => {
        try {
          const { createPdfiumEngine } = worker
            ? await import('@embedpdf/engines/pdfium-worker-engine')
            : await import('@embedpdf/engines/pdfium-direct-engine');

          const pdfEngine = await createPdfiumEngine(wasmUrl, { logger, fontFallback, workerUrl, encoderWorkerUrl });
          engineRef = pdfEngine;
          state.engine = pdfEngine;
          state.isLoading = false;
        } catch (e) {
          if (!cancelled) {
            state.error = e as Error;
            state.isLoading = false;
          }
        }
      })();

      return () => {
        cancelled = true;
        engineRef?.closeAllDocuments?.().wait(() => {
          engineRef?.destroy?.();
          engineRef = null;
        }, ignore);
      };
    });
  }

  // Return the reactive state object directly
  return state;
}
