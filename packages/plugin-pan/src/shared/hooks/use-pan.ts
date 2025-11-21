import { useCapability, usePlugin } from '@embedpdf/core/@framework';
import { PanPlugin, initialDocumentState } from '@embedpdf/plugin-pan';
import { useEffect, useState } from '@framework';

export const usePanPlugin = () => usePlugin<PanPlugin>(PanPlugin.id);
export const usePanCapability = () => useCapability<PanPlugin>(PanPlugin.id);

/**
 * Hook for pan state for a specific document
 * @param documentId Document ID
 */
export const usePan = (documentId: string) => {
  const { provides } = usePanCapability();
  const [isPanning, setIsPanning] = useState(initialDocumentState.isPanMode);

  useEffect(() => {
    if (!provides) return;

    const scope = provides.forDocument(documentId);

    // Get initial state
    setIsPanning(scope.isPanMode());

    // Subscribe to pan mode changes
    return scope.onPanModeChange((isPan) => {
      setIsPanning(isPan);
    });
  }, [provides, documentId]);

  return {
    provides: provides?.forDocument(documentId) ?? null,
    isPanning,
  };
};
