import { ignore, Logger, PdfEngine } from '@embedpdf/models';
import { DEFAULT_PDFIUM_WASM_URL } from '@embedpdf/engines';

export interface UsePdfiumEngineProps {
  wasmUrl?: string;
  worker?: boolean;
  logger?: Logger;
}

export function usePdfiumEngine(config?: UsePdfiumEngineProps) {
  const { wasmUrl = DEFAULT_PDFIUM_WASM_URL, worker = true, logger } = config ?? {};

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

          const pdfEngine = await createPdfiumEngine(wasmUrl, logger);
          engineRef = pdfEngine;

          pdfEngine.initialize().wait(
            () => {
              state.engine = pdfEngine;
              state.isLoading = false;
            },
            (e) => {
              state.error = new Error(e.reason.message);
              state.isLoading = false;
            },
          );
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
