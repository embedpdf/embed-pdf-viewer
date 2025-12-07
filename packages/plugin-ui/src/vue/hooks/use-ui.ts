import { ref, watch, computed, readonly, toValue, type MaybeRefOrGetter } from 'vue';
import { useCapability, usePlugin } from '@embedpdf/core/vue';
import { UIPlugin, UIDocumentState, UISchema } from '@embedpdf/plugin-ui';

export const useUIPlugin = () => usePlugin<UIPlugin>(UIPlugin.id);
export const useUICapability = () => useCapability<UIPlugin>(UIPlugin.id);

/**
 * Hook for UI state for a specific document
 * @param documentId Document ID (can be ref, computed, getter, or plain value)
 */
export const useUIState = (documentId: MaybeRefOrGetter<string>) => {
  const { provides } = useUICapability();
  const state = ref<UIDocumentState | null>(null);

  watch(
    [provides, () => toValue(documentId)],
    ([providesValue, docId], _, onCleanup) => {
      if (!providesValue) {
        state.value = null;
        return;
      }

      const scope = providesValue.forDocument(docId);

      // Set initial state
      state.value = scope.getState();

      // Subscribe to all changes
      const unsubToolbar = scope.onToolbarChanged(() => {
        state.value = scope.getState();
      });
      const unsubSidebar = scope.onSidebarChanged(() => {
        state.value = scope.getState();
      });
      const unsubModal = scope.onModalChanged(() => {
        state.value = scope.getState();
      });
      const unsubMenu = scope.onMenuChanged(() => {
        state.value = scope.getState();
      });

      onCleanup(() => {
        unsubToolbar();
        unsubSidebar();
        unsubModal();
        unsubMenu();
      });
    },
    { immediate: true },
  );

  // Return a computed ref for the scoped capability
  const scopedProvides = computed(() => {
    const docId = toValue(documentId);
    return provides.value?.forDocument(docId) ?? null;
  });

  return {
    provides: scopedProvides,
    state: readonly(state),
  };
};

/**
 * Hook to get UI schema
 */
export const useUISchema = () => {
  const { provides } = useUICapability();
  const schema = computed<UISchema | null>(() => provides.value?.getSchema() ?? null);

  return readonly(schema);
};
