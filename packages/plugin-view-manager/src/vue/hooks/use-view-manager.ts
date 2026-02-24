import { ref, watch, toValue, type MaybeRefOrGetter } from 'vue';
import { useCapability, usePlugin } from '@embedpdf/core/vue';
import { ViewManagerPlugin } from '@embedpdf/plugin-view-manager';
import { View } from '@embedpdf/plugin-view-manager';

export const useViewManagerPlugin = () => usePlugin<ViewManagerPlugin>(ViewManagerPlugin.id);
export const useViewManagerCapability = () =>
  useCapability<ViewManagerPlugin>(ViewManagerPlugin.id);

/**
 * Hook for a specific view's state
 * @param viewId View ID (can be ref, computed, getter, or plain value)
 */
export const useView = (viewId: MaybeRefOrGetter<string>) => {
  const { provides } = useViewManagerCapability();
  const view = ref<View | null>(null);

  watch(
    [provides, () => toValue(viewId)],
    ([providesValue, vId], _, onCleanup) => {
      if (!providesValue) {
        view.value = null;
        return;
      }

      // Get initial view
      view.value = providesValue.getView(vId);

      // Subscribe to all document events for this view
      const unsubAdded = providesValue.onDocumentAddedToView((event) => {
        if (event.viewId === vId) {
          view.value = providesValue.getView(vId);
        }
      });

      const unsubRemoved = providesValue.onDocumentRemovedFromView((event) => {
        if (event.viewId === vId) {
          view.value = providesValue.getView(vId);
        }
      });

      const unsubReordered = providesValue.onDocumentReordered((event) => {
        if (event.viewId === vId) {
          view.value = providesValue.getView(vId);
        }
      });

      const unsubActiveChanged = providesValue.onViewActiveDocumentChanged((event) => {
        if (event.viewId === vId) {
          view.value = providesValue.getView(vId);
        }
      });

      onCleanup(() => {
        unsubAdded();
        unsubRemoved();
        unsubReordered();
        unsubActiveChanged();
      });
    },
    { immediate: true },
  );

  return view;
};

/**
 * Hook for focused view state
 */
export const useFocusedView = () => {
  const { provides } = useViewManagerCapability();
  const focusedViewId = ref<string | null>(null);

  watch(
    provides,
    (providesValue, _, onCleanup) => {
      if (!providesValue) {
        focusedViewId.value = null;
        return;
      }

      focusedViewId.value = providesValue.getFocusedViewId();

      const unsubscribe = providesValue.onViewFocusChanged((event) => {
        focusedViewId.value = event.currentViewId;
      });

      onCleanup(unsubscribe);
    },
    { immediate: true },
  );

  return { focusedViewId };
};

/**
 * Hook for all views
 */
export const useAllViews = () => {
  const { provides } = useViewManagerCapability();
  const views = ref<View[]>([]);

  watch(
    provides,
    (providesValue, _, onCleanup) => {
      if (!providesValue) {
        views.value = [];
        return;
      }

      const updateViews = () => {
        views.value = providesValue.getAllViews();
      };

      updateViews();

      const unsubCreated = providesValue.onViewCreated(updateViews);
      const unsubRemoved = providesValue.onViewRemoved(updateViews);
      const unsubAdded = providesValue.onDocumentAddedToView(updateViews);
      const unsubRemovedDoc = providesValue.onDocumentRemovedFromView(updateViews);
      const unsubReordered = providesValue.onDocumentReordered(updateViews);
      const unsubActiveChanged = providesValue.onViewActiveDocumentChanged(updateViews);

      onCleanup(() => {
        unsubCreated();
        unsubRemoved();
        unsubAdded();
        unsubRemovedDoc();
        unsubReordered();
        unsubActiveChanged();
      });
    },
    { immediate: true },
  );

  return views;
};
