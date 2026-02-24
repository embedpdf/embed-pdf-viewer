import { useCapability, usePlugin } from '@embedpdf/core/@framework';
import {
  SearchPlugin,
  SearchDocumentState,
  SearchScope,
  initialSearchDocumentState,
} from '@embedpdf/plugin-search';
import { useEffect, useMemo, useState } from '@framework';

export const useSearchPlugin = () => usePlugin<SearchPlugin>(SearchPlugin.id);
export const useSearchCapability = () => useCapability<SearchPlugin>(SearchPlugin.id);

export const useSearch = (
  documentId: string,
): {
  state: SearchDocumentState;
  provides: SearchScope | null;
} => {
  const { provides } = useSearchCapability();
  const [searchState, setSearchState] = useState<SearchDocumentState>(initialSearchDocumentState);

  const scope = useMemo(() => provides?.forDocument(documentId), [provides, documentId]);

  useEffect(() => {
    if (!scope) {
      setSearchState(initialSearchDocumentState);
      return;
    }
    // Set initial state
    setSearchState(scope.getState());
    // Subscribe to changes
    return scope.onStateChange((state) => setSearchState(state));
  }, [scope]);

  return {
    state: searchState,
    provides: scope ?? null,
  };
};
