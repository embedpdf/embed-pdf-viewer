import { useMemo } from '@framework';
import { DocumentState } from '@embedpdf/core';
import { useCoreState } from './use-core-state';

/**
 * Hook that provides reactive access to a specific document's state from the core store.
 *
 * @param documentId The ID of the document to retrieve.
 * @returns The reactive DocumentState object or null if not found.
 */
export function useDocumentState(documentId: string | null): DocumentState | null {
  const coreState = useCoreState();

  const documentState = useMemo(() => {
    if (!coreState || !documentId) return null;
    return coreState.documents[documentId] ?? null;
  }, [coreState, documentId]);

  return documentState;
}
