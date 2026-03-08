import { useCapability, usePlugin } from '@embedpdf/core/@framework';
import { useState, useEffect } from '@framework';
import { FormPlugin, FormDocumentState, initialDocumentState } from '@embedpdf/plugin-form';

export const useFormPlugin = () => usePlugin<FormPlugin>(FormPlugin.id);
export const useFormCapability = () => useCapability<FormPlugin>(FormPlugin.id);

/**
 * Hook that subscribes to the form plugin's document state for a specific document.
 * Returns fieldWidgets, selectedFieldId and re-renders when they change.
 */
export const useFormDocumentState = (documentId: string): FormDocumentState => {
  const { provides } = useFormCapability();
  const [state, setState] = useState<FormDocumentState>(
    provides?.forDocument(documentId)?.getState() ?? { ...initialDocumentState },
  );

  useEffect(() => {
    if (!provides) return;

    const scope = provides.forDocument(documentId);

    // Sync with current state immediately in case it changed between render and effect
    setState(scope.getState());

    return scope.onStateChange((newState) => {
      setState(newState);
    });
  }, [provides, documentId]);

  return state;
};
