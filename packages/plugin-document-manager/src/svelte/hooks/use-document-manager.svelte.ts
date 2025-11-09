import { useCapability, usePlugin, useCoreState } from '@embedpdf/core/svelte';
import { DocumentManagerPlugin } from '@embedpdf/plugin-document-manager';
import type { DocumentState } from '@embedpdf/core';

export const useDocumentManagerPlugin = () =>
  usePlugin<DocumentManagerPlugin>(DocumentManagerPlugin.id);
export const useDocumentManagerCapability = () =>
  useCapability<DocumentManagerPlugin>(DocumentManagerPlugin.id);

/**
 * Hook for active document state
 */
export function useActiveDocument() {
  const capability = useDocumentManagerCapability();

  let activeDocumentId = $state<string | null>(null);
  let activeDocument = $state<DocumentState | null>(null);

  $effect(() => {
    if (!capability.provides) {
      activeDocumentId = null;
      activeDocument = null;
      return;
    }

    const updateActive = () => {
      const id = capability.provides!.getActiveDocumentId();
      activeDocumentId = id;
      activeDocument = id ? capability.provides!.getDocumentState(id) : null;
    };

    updateActive();

    return capability.provides.onActiveDocumentChanged(() => {
      updateActive();
    });
  });

  return {
    get activeDocumentId() {
      return activeDocumentId;
    },
    get activeDocument() {
      return activeDocument;
    },
  };
}

/**
 * Hook for all open documents (in order)
 * @param getDocumentIds Optional function that returns specific document IDs to filter/order by
 */
export function useOpenDocuments(getDocumentIds?: () => string[] | undefined) {
  const coreState = useCoreState();
  const capability = useDocumentManagerCapability();

  let documentOrder = $state<string[]>([]);

  // Reactive documentIds
  const documentIds = $derived(getDocumentIds?.());

  $effect(() => {
    if (!capability.provides) {
      documentOrder = [];
      return;
    }

    // Get initial order
    documentOrder = capability.provides.getDocumentOrder();

    // Subscribe ONLY to order changes - much cleaner!
    return capability.provides.onDocumentOrderChanged((event) => {
      documentOrder = event.order;
    });
  });

  // Map the order to actual document states from core
  const documents = $derived.by(() => {
    const core = coreState.current;
    if (!core) return [];

    // If specific documentIds are provided, use THEIR order, not the global documentOrder
    if (documentIds && documentIds.length > 0) {
      return documentIds
        .map((docId) => core.documents[docId])
        .filter((doc): doc is DocumentState => doc !== null && doc !== undefined);
    }

    // Otherwise use the global document order
    return documentOrder
      .map((docId) => core.documents[docId])
      .filter((doc): doc is DocumentState => doc !== null && doc !== undefined);
  });

  return {
    get current() {
      return documents;
    },
  };
}
