import { useEffect, useRef, useState } from '@framework';
import { ignore, Logger, PdfEngine } from '@embedpdf/models';
import type { FontFallbackConfig } from '@embedpdf/engines';

const defaultWasmUrl = `https://cdn.jsdelivr.net/npm/@embedpdf/pdfium@__PDFIUM_VERSION__/dist/pdfium.wasm`;

interface UsePdfiumEngineProps {
  wasmUrl?: string;
  worker?: boolean;
  logger?: Logger;
  encoderPoolSize?: number;
  /**
   * Font fallback configuration for handling missing fonts in PDFs.
   */
  fontFallback?: FontFallbackConfig;
}

export function usePdfiumEngine(config?: UsePdfiumEngineProps) {
  const {
    wasmUrl = defaultWasmUrl,
    worker = true,
    logger,
    encoderPoolSize,
    fontFallback,
  } = config ?? {};

  const [engine, setEngine] = useState<PdfEngine | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const engineRef = useRef<PdfEngine | null>(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const { createPdfiumEngine } = worker
          ? await import('@embedpdf/engines/pdfium-worker-engine')
          : await import('@embedpdf/engines/pdfium-direct-engine');

        const pdfEngine = await createPdfiumEngine(wasmUrl, {
          logger,
          encoderPoolSize,
          fontFallback,
        });
        engineRef.current = pdfEngine;
        setEngine(pdfEngine);
        setLoading(false);
      } catch (e) {
        if (!cancelled) {
          setError(e as Error);
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
      engineRef.current?.closeAllDocuments?.().wait(() => {
        engineRef.current?.destroy?.();
        engineRef.current = null;
      }, ignore);
    };
  }, [wasmUrl, worker, logger, fontFallback]);

  return { engine, isLoading: loading, error };
}
