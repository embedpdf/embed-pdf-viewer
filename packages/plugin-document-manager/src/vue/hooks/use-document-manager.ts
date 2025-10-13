import { DocumentState } from '@embedpdf/core';
import { useCapability, usePlugin } from '@embedpdf/core/vue';
import { DocumentManagerPlugin } from '@embedpdf/plugin-document-manager';
import { ref, watch } from 'vue';

export const useDocumentManagerPlugin = () =>
  usePlugin<DocumentManagerPlugin>(DocumentManagerPlugin.id);
export const useDocumentManagerCapability = () =>
  useCapability<DocumentManagerPlugin>(DocumentManagerPlugin.id);

export function useActiveDocument() {
  const { provides } = useDocumentManagerCapability();
  const activeDocumentId = ref<string | null>(null);
  const activeDocument = ref<DocumentState | null>(null);

  watch(
    provides,
    (providesValue, _, onCleanup) => {
      if (!providesValue) return;

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

export function useOpenDocuments() {
  const { provides } = useDocumentManagerCapability();
  const documents = ref<DocumentState[]>([]);

  watch(
    provides,
    (providesValue, _, onCleanup) => {
      if (!providesValue) return;

      const updateDocuments = () => {
        documents.value = providesValue.getOpenDocuments();
      };

      updateDocuments();

      const unsubOpen = providesValue.onDocumentOpened(updateDocuments);
      const unsubClose = providesValue.onDocumentClosed(updateDocuments);
      const unsubOrder = providesValue.onDocumentOrderChanged(updateDocuments);

      onCleanup(() => {
        unsubOpen();
        unsubClose();
        unsubOrder();
      });
    },
    { immediate: true },
  );

  return documents;
}

export function useDocumentState(documentIdRef: () => string | null) {
  const { provides } = useDocumentManagerCapability();
  const documentState = ref<DocumentState | null>(null);

  watch(
    [provides, documentIdRef],
    ([providesValue, documentId], _, onCleanup) => {
      if (!providesValue || !documentId) {
        documentState.value = null;
        return;
      }

      const updateState = () => {
        documentState.value = providesValue.getDocumentState(documentId);
      };

      updateState();

      const unsubOpen = providesValue.onDocumentOpened((info) => {
        if (info.id === documentId) updateState();
      });

      const unsubClose = providesValue.onDocumentClosed((id) => {
        if (id === documentId) documentState.value = null;
      });

      onCleanup(() => {
        unsubOpen();
        unsubClose();
      });
    },
    { immediate: true },
  );

  return documentState;
}
