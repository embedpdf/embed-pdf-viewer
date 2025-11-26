import { useCapability, usePlugin } from '@embedpdf/core/@framework';
import {
  AnnotationPlugin,
  AnnotationDocumentState,
  initialDocumentState,
} from '@embedpdf/plugin-annotation';
import { useState, useEffect } from '@framework';

export const useAnnotationPlugin = () => usePlugin<AnnotationPlugin>(AnnotationPlugin.id);
export const useAnnotationCapability = () => useCapability<AnnotationPlugin>(AnnotationPlugin.id);

/**
 * Hook for annotation state for a specific document
 * @param documentId Document ID
 */
export const useAnnotation = (documentId: string) => {
  const { provides } = useAnnotationCapability();
  const [state, setState] = useState<AnnotationDocumentState>(
    provides?.forDocument(documentId)?.getState() ?? initialDocumentState(),
  );

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
