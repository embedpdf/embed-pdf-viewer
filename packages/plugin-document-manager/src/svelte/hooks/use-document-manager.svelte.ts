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
  // Keep reference to avoid destructuring - maintains reactivity
  const coreStateRef = useCoreState();

  // Use $derived.by for computed values that depend on the reactive coreState
  const activeDocumentId = $derived.by(() => {
    return coreStateRef.current?.activeDocumentId ?? null;
  });

  const activeDocument = $derived.by(() => {
    const core = coreStateRef.current;
    if (!core) return null;

    const docId = core.activeDocumentId;
    return docId ? (core.documents[docId] ?? null) : null;
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
 * @param documentIds Optional array of specific document IDs to filter/order by
 */
export function useOpenDocuments(documentIds?: string[]) {
  // Keep reference to avoid destructuring - maintains reactivity
  const coreStateRef = useCoreState();

  // Use $derived.by for computed array of documents
  const documents = $derived.by(() => {
    const core = coreStateRef.current;
    if (!core) return [];

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

  return {
    get current() {
      return documents;
    },
  };
}
