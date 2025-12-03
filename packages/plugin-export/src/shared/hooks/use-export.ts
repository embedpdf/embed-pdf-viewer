import { useCapability, usePlugin } from '@embedpdf/core/@framework';
import { ExportPlugin } from '@embedpdf/plugin-export';

export const useExportPlugin = () => usePlugin<ExportPlugin>(ExportPlugin.id);
export const useExportCapability = () => useCapability<ExportPlugin>(ExportPlugin.id);

/**
 * Hook for export capability for a specific document
 * @param documentId Document ID
 */
export const useExport = (documentId: string) => {
  const { provides } = useExportCapability();

  return {
    provides: provides?.forDocument(documentId) ?? null,
  };
};
