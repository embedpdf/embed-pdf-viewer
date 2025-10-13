import { ReactNode, useCallback } from '@framework';
import { useOpenDocuments, useActiveDocument, useDocumentManagerCapability } from '../hooks';
import { DocumentState } from '@embedpdf/core';

export interface TabActions {
  select: (documentId: string) => void;
  close: (documentId: string) => void;
  move: (documentId: string, toIndex: number) => void;
}

export interface DocumentTabsRenderProps {
  documentStates: DocumentState[];
  activeDocumentId: string | null;
  actions: TabActions;
}

interface DocumentTabsProps {
  children: (props: DocumentTabsRenderProps) => ReactNode;
}

/**
 * Headless component for managing document tabs
 * Provides all state and actions, completely UI-agnostic
 *
 * @example
 * <DocumentTabs>
 *   {({ documents, activeDocumentId, actions }) => (
 *     <div className="tabs">
 *       {documents.map((doc) => (
 *         <button
 *           key={doc.id}
 *           onClick={() => actions.select(doc.id)}
 *           className={doc.id === activeDocumentId ? 'active' : ''}
 *         >
 *           {doc.name}
 *           <button onClick={(e) => {
 *             e.stopPropagation();
 *             actions.close(doc.id);
 *           }}>×</button>
 *         </button>
 *       ))}
 *     </div>
 *   )}
 * </DocumentTabs>
 */
export function DocumentTabs({ children }: DocumentTabsProps) {
  const documentStates = useOpenDocuments();
  const { activeDocumentId } = useActiveDocument();
  const { provides } = useDocumentManagerCapability();

  const select = useCallback(
    (documentId: string) => {
      provides?.setActiveDocument(documentId);
    },
    [provides],
  );

  const close = useCallback(
    (documentId: string) => {
      provides?.closeDocument(documentId);
    },
    [provides],
  );

  const move = useCallback(
    (documentId: string, toIndex: number) => {
      provides?.moveDocument(documentId, toIndex);
    },
    [provides],
  );

  const actions: TabActions = {
    select,
    close,
    move,
  };

  return <>{children({ documentStates, activeDocumentId, actions })}</>;
}
