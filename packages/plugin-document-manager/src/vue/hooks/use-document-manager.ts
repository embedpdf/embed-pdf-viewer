import { DocumentState } from '@embedpdf/core';
import { useCapability, usePlugin, useCoreState } from '@embedpdf/core/vue';
import { DocumentManagerPlugin } from '@embedpdf/plugin-document-manager';
import { computed, toValue, type MaybeRefOrGetter } from 'vue';

export const useDocumentManagerPlugin = () =>
  usePlugin<DocumentManagerPlugin>(DocumentManagerPlugin.id);
export const useDocumentManagerCapability = () =>
  useCapability<DocumentManagerPlugin>(DocumentManagerPlugin.id);

/**
 * Hook for active document state
 */
export function useActiveDocument() {
  const coreState = useCoreState();

  const activeDocumentId = computed(() => {
    return coreState.value?.activeDocumentId ?? null;
  });

  const activeDocument = computed(() => {
    const core = coreState.value;
    if (!core) return null;

    const docId = core.activeDocumentId;
    return docId ? (core.documents[docId] ?? null) : null;
  });

  return {
    activeDocumentId,
    activeDocument,
  };
}

/**
 * Hook for all open documents (in order)
 * @param getDocumentIds Optional getter function, ref, or array of specific document IDs to filter/order by
 */
export function useOpenDocuments(getDocumentIds?: MaybeRefOrGetter<string[] | undefined>) {
  const coreState = useCoreState();

  const documents = computed(() => {
    const core = coreState.value;
    if (!core) return [];

    // Get documentIds reactively if provided
    const documentIds = getDocumentIds ? toValue(getDocumentIds) : undefined;

    // If specific documentIds are provided, use THEIR order
    if (documentIds && documentIds.length > 0) {
      return documentIds
        .map((docId) => core.documents[docId])
        .filter((doc): doc is DocumentState => doc !== null && doc !== undefined);
    }

    // Otherwise use the global document order
    return core.documentOrder
      .map((docId) => core.documents[docId])
      .filter((doc): doc is DocumentState => doc !== null && doc !== undefined);
  });

  return documents;
}
