import { computed, toValue, type MaybeRefOrGetter } from 'vue';
import { useCoreState } from './use-core-state';

/**
 * Hook that provides reactive access to a specific document's state from the core store.
 *
 * @param documentId The ID of the document to retrieve (can be ref, computed, getter, or plain value).
 * @returns A computed ref containing the DocumentState object or null if not found.
 */
export function useDocumentState(documentId: MaybeRefOrGetter<string | null>) {
  const coreState = useCoreState();

  const documentState = computed(() => {
    const core = coreState.value;
    const docId = toValue(documentId);

    if (!core || !docId) return null;
    return core.documents[docId] ?? null;
  });

  return documentState;
}
