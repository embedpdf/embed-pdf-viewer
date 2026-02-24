import { useCoreState } from './use-core-state.svelte';

/**
 * Hook that provides reactive access to a specific document's state from the core store.
 *
 * @param getDocumentId Function that returns the document ID
 * @returns The reactive DocumentState object or null if not found.
 */
export function useDocumentState(getDocumentId: () => string | null) {
  const coreStateRef = useCoreState();

  // Reactive documentId
  const documentId = $derived(getDocumentId());

  const documentState = $derived(
    coreStateRef.current && documentId
      ? (coreStateRef.current.documents[documentId] ?? null)
      : null,
  );

  return {
    get current() {
      return documentState;
    },
  };
}
