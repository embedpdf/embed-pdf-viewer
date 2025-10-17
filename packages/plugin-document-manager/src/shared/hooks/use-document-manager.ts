import { useEffect, useState } from '@framework';
import { useCapability, usePlugin } from '@embedpdf/core/@framework';
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
  const { provides } = useDocumentManagerCapability();
  const [documents, setDocuments] = useState<DocumentState[]>([]);

  useEffect(() => {
    if (!provides) return;

    const updateDocuments = () => {
      setDocuments(provides.getOpenDocuments());
    };

    updateDocuments();

    const unsubOpen = provides.onDocumentOpened(updateDocuments);
    const unsubClose = provides.onDocumentClosed(updateDocuments);
    const unsubOrder = provides.onDocumentOrderChanged(updateDocuments);

    return () => {
      unsubOpen();
      unsubClose();
      unsubOrder();
    };
  }, [provides]);

  return documents;
};

/**
 * Hook for a specific document's info
 */
export const useDocumentState = (documentId: string | null) => {
  const { provides } = useDocumentManagerCapability();
  const [documentState, setDocumentState] = useState<DocumentState | null>(null);

  useEffect(() => {
    if (!provides || !documentId) {
      setDocumentState(null);
      return;
    }

    const updateState = () => {
      setDocumentState(provides.getDocumentState(documentId));
    };

    updateState();

    const unsubOpen = provides.onDocumentOpened((info) => {
      if (info.id === documentId) updateState();
    });

    const unsubClose = provides.onDocumentClosed((id) => {
      if (id === documentId) setDocumentState(null);
    });

    // Add this subscription to handle error events
    const unsubError = provides.onDocumentError((errorEvent) => {
      if (errorEvent.documentId === documentId) updateState();
    });

    return () => {
      unsubOpen();
      unsubClose();
      unsubError(); // Don't forget to unsubscribe
    };
  }, [provides, documentId]);

  return documentState;
};
