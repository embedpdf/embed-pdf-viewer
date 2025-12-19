import { ref, onMounted, onBeforeUnmount, watch, Ref } from 'vue';
import { ignore, type Logger, type PdfEngine } from '@embedpdf/models';

const defaultWasmUrl =
  'https://cdn.jsdelivr.net/npm/@embedpdf/pdfium@__PDFIUM_VERSION__/dist/pdfium.wasm';

interface UsePdfiumEngineProps {
  wasmUrl?: string;
  worker?: boolean;
  logger?: Logger;
}

interface UsePdfiumEngineResult {
  engine: Ref<PdfEngine | null>;
  isLoading: Ref<boolean>;
  error: Ref<Error | null>;
}

/**
 * Vue composable that loads a PdfiumEngine (worker or direct)
 * and keeps its lifetime tied to the component.
 */
export function usePdfiumEngine(props: UsePdfiumEngineProps = {}): UsePdfiumEngineResult {
  const { wasmUrl = defaultWasmUrl, worker = true, logger } = props;

  const engine = ref<PdfEngine | null>(null);
  const isLoading = ref(true);
  const error = ref<Error | null>(null);

  /* create / destroy tied to component lifecycle ----------------- */
  onMounted(loadEngine);
  onBeforeUnmount(destroyEngine);

  /* re‑load if reactive props change ----------------------------- */
  watch(
    () => [wasmUrl, worker, logger] as const,
    () => {
      destroyEngine();
      loadEngine();
    },
  );

  async function loadEngine() {
    try {
      const { createPdfiumEngine } = worker
        ? await import('@embedpdf/engines/pdfium-worker-engine')
        : await import('@embedpdf/engines/pdfium-direct-engine');

      const pdfEngine = await createPdfiumEngine(wasmUrl, { logger });
      engine.value = pdfEngine;
      isLoading.value = false;
    } catch (e) {
      error.value = e as Error;
      isLoading.value = false;
    }
  }

  function destroyEngine() {
    engine.value?.closeAllDocuments?.().wait(() => {
      engine.value?.destroy?.();
      engine.value = null;
    }, ignore);
  }

  return { engine, isLoading, error };
}
