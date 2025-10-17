import { ignore, Logger, PdfEngine } from '@embedpdf/models';
import { DEFAULT_PDFIUM_WASM_URL } from '@embedpdf/engines';

export interface UsePdfiumEngineProps {
  wasmUrl?: string;
  worker?: boolean;
  logger?: Logger;
}

export function usePdfiumEngine(config?: UsePdfiumEngineProps) {
  const { wasmUrl = DEFAULT_PDFIUM_WASM_URL, worker = true, logger } = config ?? {};

  let engine = $state<PdfEngine | null>(null);
  let loading = $state(true);
  let error = $state<Error | null>(null);
  let engineRef = $state<PdfEngine | null>();

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
            engine = pdfEngine;
            loading = false;
          },
          (e) => {
            error = new Error(e.reason.message);
            loading = false;
          },
        );
      } catch (e) {
        if (!cancelled) {
          error = e as Error;
          loading = false;
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

  // IMPORTANT: expose *getters* so consumers read live state
  return {
    get engine() {
      return engine;
    },
    get isLoading() {
      return loading;
    },
    get error() {
      return error;
    },
  };
}
