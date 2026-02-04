import { useCapability, usePlugin } from '@embedpdf/core/@framework';
import { initialDocumentState, ZoomDocumentState, ZoomPlugin } from '@embedpdf/plugin-zoom';
import { useEffect, useState } from '@framework';

export const useZoomCapability = () => useCapability<ZoomPlugin>(ZoomPlugin.id);
export const useZoomPlugin = () => usePlugin<ZoomPlugin>(ZoomPlugin.id);

/**
 * Hook for zoom state for a specific document
 * @param documentId Document ID
 */
export const useZoom = (documentId: string) => {
  const { provides } = useZoomCapability();
  const [state, setState] = useState<ZoomDocumentState>(initialDocumentState);

  useEffect(() => {
    if (!provides) return;

    const scope = provides.forDocument(documentId);

    // Get initial state
    setState(scope.getState());

    // Subscribe to state changes
    return scope.onStateChange((newState) => {
      setState(newState);
    });
  }, [provides, documentId]);

  return {
    state,
    provides: provides?.forDocument(documentId) ?? null,
  };
};
