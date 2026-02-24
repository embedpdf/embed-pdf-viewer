import { ReactNode, useEffect, useState } from '@framework';
import { useViewManagerCapability } from '../hooks';
import { View } from '@embedpdf/plugin-view-manager';

export interface ViewContextRenderProps {
  view: View;
  documentIds: string[];
  activeDocumentId: string | null;
  isFocused: boolean;
  addDocument: (documentId: string, index?: number) => void;
  removeDocument: (documentId: string) => void;
  setActiveDocument: (documentId: string | null) => void;
  moveDocumentWithinView: (documentId: string, index: number) => void;
  focus: () => void;
}

interface ViewContextProps {
  viewId: string;
  autoCreate?: boolean;
  children: (props: ViewContextRenderProps) => ReactNode;
}

/**
 * Headless component for managing a single view with multiple documents
 */
export function ViewContext({ viewId, autoCreate = true, children }: ViewContextProps) {
  const { provides } = useViewManagerCapability();
  const [view, setView] = useState<View | null>(null);
  const [isFocused, setIsFocused] = useState(false);

  useEffect(() => {
    if (!provides) return;

    // Get or create view
    let v = provides.getView(viewId);
    if (!v && autoCreate) {
      provides.createView(viewId);
      v = provides.getView(viewId);
    }
    setView(v);
    setIsFocused(provides.getFocusedViewId() === viewId);

    const unsubFocus = provides.onViewFocusChanged((event) => {
      setIsFocused(event.currentViewId === viewId);
    });

    const unsubAdded = provides.onDocumentAddedToView((event) => {
      if (event.viewId === viewId) {
        setView(provides.getView(viewId));
      }
    });

    const unsubRemoved = provides.onDocumentRemovedFromView((event) => {
      if (event.viewId === viewId) {
        setView(provides.getView(viewId));
      }
    });

    const unsubActiveChanged = provides.onViewActiveDocumentChanged((event) => {
      if (event.viewId === viewId) {
        setView(provides.getView(viewId));
      }
    });

    return () => {
      unsubFocus();
      unsubAdded();
      unsubRemoved();
      unsubActiveChanged();
    };
  }, [viewId, autoCreate, provides]);

  if (!view) return null;

  return (
    <>
      {children({
        view,
        documentIds: view.documentIds,
        activeDocumentId: view.activeDocumentId,
        isFocused,
        addDocument: (docId, index) => provides?.addDocumentToView(viewId, docId, index),
        removeDocument: (docId) => provides?.removeDocumentFromView(viewId, docId),
        setActiveDocument: (docId) => provides?.setViewActiveDocument(viewId, docId),
        moveDocumentWithinView: (docId, index) =>
          provides?.moveDocumentWithinView(viewId, docId, index),
        focus: () => provides?.setFocusedView(viewId),
      })}
    </>
  );
}
