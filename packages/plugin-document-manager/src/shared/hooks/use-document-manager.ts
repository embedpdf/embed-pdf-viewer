import { useEffect, useState, useMemo } from '@framework';
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
  const { provides } = useDocumentManagerCapability();
  const [activeDocumentId, setActiveDocumentId] = useState<string | null>(null);
  const [activeDocument, setActiveDocument] = useState<DocumentState | null>(null);

  useEffect(() => {
    if (!provides) return;

    const updateActive = () => {
      const id = provides.getActiveDocumentId();
      setActiveDocumentId(id);
      setActiveDocument(id ? provides.getDocumentState(id) : null);
    };

    updateActive();

    return provides.onActiveDocumentChanged(() => {
      updateActive();
    });
  }, [provides]);

  return {
    activeDocumentId,
    activeDocument,
  };
};

/**
 * Hook for all open documents (in order)
 */
export const useOpenDocuments = () => {
  const coreState = useCoreState();
  const { provides } = useDocumentManagerCapability();
  const [documentOrder, setDocumentOrder] = useState<string[]>([]);

  useEffect(() => {
    if (!provides) return;

    // Get initial order
    setDocumentOrder(provides.getDocumentOrder());

    // Subscribe ONLY to order changes - much cleaner!
    return provides.onDocumentOrderChanged((event) => {
      setDocumentOrder(event.order);
    });
  }, [provides]);

  // Map the order to actual document states from core
  const documents = useMemo(() => {
    if (!coreState) return [];

    return documentOrder
      .map((docId) => coreState.documents[docId])
      .filter((doc): doc is DocumentState => doc !== null && doc !== undefined);
  }, [coreState, documentOrder]);

  return documents;
};
