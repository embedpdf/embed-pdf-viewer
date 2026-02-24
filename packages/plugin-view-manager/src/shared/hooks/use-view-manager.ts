import { useEffect, useState } from '@framework';
import { useCapability, usePlugin } from '@embedpdf/core/@framework';
import { ViewManagerPlugin } from '@embedpdf/plugin-view-manager';
import { View } from '@embedpdf/plugin-view-manager';

export const useViewManagerPlugin = () => usePlugin<ViewManagerPlugin>(ViewManagerPlugin.id);
export const useViewManagerCapability = () =>
  useCapability<ViewManagerPlugin>(ViewManagerPlugin.id);

/**
 * Hook for a specific view's state
 */
export const useView = (viewId: string) => {
  const { provides } = useViewManagerCapability();
  const [view, setView] = useState<View | null>(null);

  useEffect(() => {
    if (!provides) return;

    // Get initial view
    setView(provides.getView(viewId));

    // Subscribe to all document events for this view
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

    const unsubReordered = provides.onDocumentReordered((event) => {
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
      unsubAdded();
      unsubRemoved();
      unsubReordered();
      unsubActiveChanged();
    };
  }, [viewId, provides]);

  return view;
};

/**
 * Hook for focused view state
 */
export const useFocusedView = () => {
  const { provides } = useViewManagerCapability();
  const [focusedViewId, setFocusedViewId] = useState<string | null>(null);

  useEffect(() => {
    if (!provides) return;

    setFocusedViewId(provides.getFocusedViewId());

    return provides.onViewFocusChanged((event) => {
      setFocusedViewId(event.currentViewId);
    });
  }, [provides]);

  return { focusedViewId };
};

/**
 * Hook for all views
 */
export const useAllViews = () => {
  const { provides } = useViewManagerCapability();
  const [views, setViews] = useState<View[]>([]);

  useEffect(() => {
    if (!provides) return;

    const updateViews = () => {
      setViews(provides.getAllViews());
    };

    updateViews();

    const unsubCreated = provides.onViewCreated(updateViews);
    const unsubRemoved = provides.onViewRemoved(updateViews);
    const unsubAdded = provides.onDocumentAddedToView(updateViews);
    const unsubRemovedDoc = provides.onDocumentRemovedFromView(updateViews);
    const unsubReordered = provides.onDocumentReordered(updateViews);
    const unsubActiveChanged = provides.onViewActiveDocumentChanged(updateViews);

    return () => {
      unsubCreated();
      unsubRemoved();
      unsubAdded();
      unsubRemovedDoc();
      unsubReordered();
      unsubActiveChanged();
    };
  }, [provides]);

  return views;
};
