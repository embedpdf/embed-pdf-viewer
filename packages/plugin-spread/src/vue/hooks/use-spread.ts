import { ref, watch, computed, readonly } from 'vue';
import { useCapability, usePlugin } from '@embedpdf/core/vue';
import { SpreadMode, SpreadPlugin, initialDocumentState } from '@embedpdf/plugin-spread';

export const useSpreadPlugin = () => usePlugin<SpreadPlugin>(SpreadPlugin.id);
export const useSpreadCapability = () => useCapability<SpreadPlugin>(SpreadPlugin.id);

/**
 * Hook for spread state for a specific document
 * @param documentId Document ID
 */
export const useSpread = (documentId: string) => {
  const { provides } = useSpreadCapability();
  const spreadMode = ref<SpreadMode>(initialDocumentState.spreadMode);

  watch(
    provides,
    (providesValue, _, onCleanup) => {
      if (providesValue) {
        const scope = providesValue.forDocument(documentId);

        // Set initial spread mode
        spreadMode.value = scope.getSpreadMode();

        // Subscribe to spread mode changes
        const unsubscribe = scope.onSpreadChange((newSpreadMode) => {
          spreadMode.value = newSpreadMode;
        });

        onCleanup(unsubscribe);
      }
    },
    { immediate: true },
  );

  // Return a computed ref for the scoped capability
  const scopedProvides = computed(() => provides.value?.forDocument(documentId) ?? null);

  return {
    provides: scopedProvides,
    spreadMode: readonly(spreadMode),
  };
};
