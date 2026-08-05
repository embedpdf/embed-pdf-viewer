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
   * Set to `null` to disable the fallback entirely (no external font requests).
   */
  fontFallback?: FontFallbackConfig | null;
}

function disposeEngine(engine: PdfEngine | null) {
  engine?.closeAllDocuments?.().wait(() => {
    engine?.destroy?.();
  }, ignore);
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

        // Effect torn down before we resolved (e.g. Strict Mode's dev
        // remount): discard this engine instead of committing it.
        if (cancelled) {
          disposeEngine(pdfEngine);
          return;
        }

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
      disposeEngine(engineRef.current);
      engineRef.current = null;
    };
  }, [wasmUrl, worker, logger, fontFallback]);

  return { engine, isLoading: loading, error };
}
