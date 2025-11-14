import { useCapability, usePlugin } from '@embedpdf/core/@framework';
import {
  CapturePlugin,
  CaptureDocumentState,
  initialDocumentState,
} from '@embedpdf/plugin-capture';
import { useState, useEffect } from '@framework';

export const useCaptureCapability = () => useCapability<CapturePlugin>(CapturePlugin.id);
export const useCapturePlugin = () => usePlugin<CapturePlugin>(CapturePlugin.id);

/**
 * Hook for capture state for a specific document
 * @param documentId Document ID
 */
export const useCapture = (documentId: string) => {
  const { provides } = useCaptureCapability();
  const [state, setState] = useState<CaptureDocumentState>(initialDocumentState);

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
