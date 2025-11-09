import { useCoreState } from './use-core-state.svelte';

/**
 * Hook that provides reactive access to a specific document's state from the core store.
 *
 * @param documentId The ID of the document to retrieve.
 * @returns The reactive DocumentState object or null if not found.
 */
export function useDocumentState(documentId: string | null) {
  const coreState = useCoreState();

  const documentState = $derived(
    coreState.current && documentId ? (coreState.current.documents[documentId] ?? null) : null,
  );

  return {
    get current() {
      return documentState;
    },
  };
}
