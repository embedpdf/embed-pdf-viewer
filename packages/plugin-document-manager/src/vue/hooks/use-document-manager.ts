import { DocumentState } from '@embedpdf/core';
import { useCapability, usePlugin, useCoreState } from '@embedpdf/core/vue';
import { DocumentManagerPlugin } from '@embedpdf/plugin-document-manager';
import { ref, watch, computed, type MaybeRefOrGetter } from 'vue';
import { toValue } from 'vue';

export const useDocumentManagerPlugin = () =>
  usePlugin<DocumentManagerPlugin>(DocumentManagerPlugin.id);
export const useDocumentManagerCapability = () =>
  useCapability<DocumentManagerPlugin>(DocumentManagerPlugin.id);

/**
 * Hook for active document state
 */
export function useActiveDocument() {
  const { provides } = useDocumentManagerCapability();
  const activeDocumentId = ref<string | null>(null);
  const activeDocument = ref<DocumentState | null>(null);

  watch(
    provides,
    (providesValue, _, onCleanup) => {
      if (!providesValue) {
        activeDocumentId.value = null;
        activeDocument.value = null;
        return;
      }

      const updateActive = () => {
        const id = providesValue.getActiveDocumentId();
        activeDocumentId.value = id;
        activeDocument.value = id ? providesValue.getDocumentState(id) : null;
      };

      updateActive();

      const unsubscribe = providesValue.onActiveDocumentChanged(() => {
        updateActive();
      });

      onCleanup(unsubscribe);
    },
    { immediate: true },
  );

  return {
    activeDocumentId,
    activeDocument,
  };
}

/**
 * Hook for all open documents (in order)
 * @param documentIds Optional specific document IDs to filter/order by
 */
export function useOpenDocuments(documentIds?: MaybeRefOrGetter<string[] | undefined>) {
  const coreState = useCoreState();
  const { provides } = useDocumentManagerCapability();
  const documentOrder = ref<string[]>([]);

  watch(
    provides,
    (providesValue, _, onCleanup) => {
      if (!providesValue) {
        documentOrder.value = [];
        return;
      }

      // Get initial order
      documentOrder.value = providesValue.getDocumentOrder();

      // Subscribe ONLY to order changes - much cleaner!
      const unsubscribe = providesValue.onDocumentOrderChanged((event) => {
        documentOrder.value = event.order;
      });

      onCleanup(unsubscribe);
    },
    { immediate: true },
  );

  // Map the order to actual document states from core
  const documents = computed(() => {
    const core = coreState.value;
    if (!core) return [];

    const ids = toValue(documentIds);

    // If specific documentIds are provided, use THEIR order, not the global documentOrder
    if (ids && ids.length > 0) {
      return ids
        .map((docId) => core.documents[docId])
        .filter((doc): doc is DocumentState => doc !== null && doc !== undefined);
    }

    // Otherwise use the global document order
    return documentOrder.value
      .map((docId) => core.documents[docId])
      .filter((doc): doc is DocumentState => doc !== null && doc !== undefined);
  });

  return documents;
}
