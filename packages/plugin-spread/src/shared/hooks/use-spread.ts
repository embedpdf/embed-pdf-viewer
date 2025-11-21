import { useCapability, usePlugin } from '@embedpdf/core/@framework';
import { SpreadMode, SpreadPlugin, initialDocumentState } from '@embedpdf/plugin-spread';
import { useEffect, useState } from '@framework';

export const useSpreadPlugin = () => usePlugin<SpreadPlugin>(SpreadPlugin.id);
export const useSpreadCapability = () => useCapability<SpreadPlugin>(SpreadPlugin.id);

/**
 * Hook for spread state for a specific document
 * @param documentId Document ID
 */
export const useSpread = (documentId: string) => {
  const { provides } = useSpreadCapability();
  const [spreadMode, setSpreadMode] = useState<SpreadMode>(initialDocumentState.spreadMode);

  useEffect(() => {
    if (!provides) return;

    const scope = provides.forDocument(documentId);

    // Get initial state
    setSpreadMode(scope.getSpreadMode());

    // Subscribe to spread mode changes
    return scope.onSpreadChange((newSpreadMode) => {
      setSpreadMode(newSpreadMode);
    });
  }, [provides, documentId]);

  return {
    spreadMode,
    provides: provides?.forDocument(documentId) ?? null,
  };
};
