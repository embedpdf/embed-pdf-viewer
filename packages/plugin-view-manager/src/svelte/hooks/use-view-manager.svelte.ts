import { useCapability, usePlugin } from '@embedpdf/core/svelte';
import { ViewManagerPlugin, View } from '@embedpdf/plugin-view-manager';

export const useViewManagerPlugin = () => usePlugin<ViewManagerPlugin>(ViewManagerPlugin.id);
export const useViewManagerCapability = () =>
  useCapability<ViewManagerPlugin>(ViewManagerPlugin.id);

/**
 * Hook for a specific view's state
 * @param getViewId Function that returns the view ID
 */
export const useView = (getViewId: () => string | null) => {
  const capability = useViewManagerCapability();

  let view = $state<View | null>(null);

  // Reactive viewId
  const viewId = $derived(getViewId());

  $effect(() => {
    const provides = capability.provides;
    const currentViewId = viewId;

    if (!provides || !currentViewId) {
      view = null;
      return;
    }

    // Get initial view
    view = provides.getView(currentViewId);

    // Subscribe to all document events for this view
    const unsubAdded = provides.onDocumentAddedToView((event) => {
      if (event.viewId === currentViewId) {
        view = provides.getView(currentViewId);
      }
    });

    const unsubRemoved = provides.onDocumentRemovedFromView((event) => {
      if (event.viewId === currentViewId) {
        view = provides.getView(currentViewId);
      }
    });

    const unsubReordered = provides.onDocumentReordered((event) => {
      if (event.viewId === currentViewId) {
        view = provides.getView(currentViewId);
      }
    });

    const unsubActiveChanged = provides.onViewActiveDocumentChanged((event) => {
      if (event.viewId === currentViewId) {
        view = provides.getView(currentViewId);
      }
    });

    return () => {
      unsubAdded();
      unsubRemoved();
      unsubReordered();
      unsubActiveChanged();
    };
  });

  return {
    get current() {
      return view;
    },
  };
};

/**
 * Hook for focused view state
 */
export const useFocusedView = () => {
  const capability = useViewManagerCapability();

  let focusedViewId = $state<string | null>(null);

  $effect(() => {
    if (!capability.provides) {
      focusedViewId = null;
      return;
    }

    focusedViewId = capability.provides.getFocusedViewId();

    return capability.provides.onViewFocusChanged((event) => {
      focusedViewId = event.currentViewId;
    });
  });

  return {
    get focusedViewId() {
      return focusedViewId;
    },
  };
};

/**
 * Hook for all views
 */
export const useAllViews = () => {
  const capability = useViewManagerCapability();

  let views = $state<View[]>([]);

  $effect(() => {
    if (!capability.provides) {
      views = [];
      return;
    }

    const updateViews = () => {
      views = capability.provides!.getAllViews();
    };

    updateViews();

    const unsubCreated = capability.provides.onViewCreated(updateViews);
    const unsubRemoved = capability.provides.onViewRemoved(updateViews);
    const unsubAdded = capability.provides.onDocumentAddedToView(updateViews);
    const unsubRemovedDoc = capability.provides.onDocumentRemovedFromView(updateViews);
    const unsubReordered = capability.provides.onDocumentReordered(updateViews);
    const unsubActiveChanged = capability.provides.onViewActiveDocumentChanged(updateViews);

    return () => {
      unsubCreated();
      unsubRemoved();
      unsubAdded();
      unsubRemovedDoc();
      unsubReordered();
      unsubActiveChanged();
    };
  });

  return {
    get current() {
      return views;
    },
  };
};
