import { useCapability, usePlugin } from '@embedpdf/core/@framework';
import {
  initialDocumentState,
  RedactionPlugin,
  RedactionDocumentState,
  RedactionScope,
} from '@embedpdf/plugin-redaction';
import { useState, useEffect, useMemo } from '@framework';

export const useRedactionPlugin = () => usePlugin<RedactionPlugin>(RedactionPlugin.id);
export const useRedactionCapability = () => useCapability<RedactionPlugin>(RedactionPlugin.id);

export const useRedaction = (
  documentId: string,
): {
  state: RedactionDocumentState;
  provides: RedactionScope | null;
} => {
  const { provides } = useRedactionCapability();
  const [state, setState] = useState<RedactionDocumentState>(initialDocumentState);

  const scope = useMemo(
    () => (provides ? provides.forDocument(documentId) : null),
    [provides, documentId],
  );

  useEffect(() => {
    if (!scope) {
      setState(initialDocumentState);
      return;
    }

    // Set initial state
    try {
      setState(scope.getState());
    } catch (e) {
      // Handle case where state might not be ready
      setState(initialDocumentState);
    }

    // Subscribe to changes
    const unsubscribe = scope.onStateChange((newState) => {
      setState(newState);
    });

    return unsubscribe;
  }, [scope]);

  return {
    state,
    provides: scope,
  };
};
