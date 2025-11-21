import { useCapability, usePlugin } from '@embedpdf/core/@framework';
import { PrintPlugin } from '@embedpdf/plugin-print';

export const usePrintPlugin = () => usePlugin<PrintPlugin>(PrintPlugin.id);
export const usePrintCapability = () => useCapability<PrintPlugin>(PrintPlugin.id);

/**
 * Hook for print capability for a specific document
 * @param documentId Document ID
 */
export const usePrint = (documentId: string) => {
  const { provides } = usePrintCapability();

  return {
    provides: provides?.forDocument(documentId) ?? null,
  };
};
