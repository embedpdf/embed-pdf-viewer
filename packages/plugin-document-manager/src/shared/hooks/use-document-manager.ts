import { useMemo } from '@framework';
import { useCapability, useCoreState, usePlugin } from '@embedpdf/core/@framework';
import { DocumentManagerPlugin } from '@embedpdf/plugin-document-manager';
import { DocumentState } from '@embedpdf/core';

export const useDocumentManagerPlugin = () =>
  usePlugin<DocumentManagerPlugin>(DocumentManagerPlugin.id);
export const useDocumentManagerCapability = () =>
  useCapability<DocumentManagerPlugin>(DocumentManagerPlugin.id);

/**
 * Hook for active document state
 */
export const useActiveDocument = () => {
  const coreState = useCoreState();

  return useMemo(() => {
    if (!coreState) {
      return {
        activeDocumentId: null,
        activeDocument: null,
      };
    }

    const activeDocumentId = coreState.activeDocumentId;
    const activeDocument = activeDocumentId
      ? (coreState.documents[activeDocumentId] ?? null)
      : null;

    return {
      activeDocumentId,
      activeDocument,
    };
  }, [coreState]);
};

/**
 * Hook for all open documents (in order)
 */
export const useOpenDocuments = (documentIds?: string[]) => {
  const coreState = useCoreState();

  return useMemo(() => {
    if (!coreState) return [];

    // If specific documentIds are provided, use THEIR order
    if (documentIds && documentIds.length > 0) {
      return documentIds
        .map((docId) => coreState.documents[docId])
        .filter((doc): doc is DocumentState => doc !== null && doc !== undefined);
    }

    // Otherwise use the global document order
    return coreState.documentOrder
      .map((docId) => coreState.documents[docId])
      .filter((doc): doc is DocumentState => doc !== null && doc !== undefined);
  }, [coreState, documentIds]);
};
