import { ref, watch, computed, readonly, toValue, type MaybeRefOrGetter } from 'vue';
import { useCapability, usePlugin } from '@embedpdf/core/vue';
import { SpreadMode, SpreadPlugin, initialDocumentState } from '@embedpdf/plugin-spread';

export const useSpreadPlugin = () => usePlugin<SpreadPlugin>(SpreadPlugin.id);
export const useSpreadCapability = () => useCapability<SpreadPlugin>(SpreadPlugin.id);

/**
 * Hook for spread state for a specific document
 * @param documentId Document ID (can be ref, computed, getter, or plain value)
 */
export const useSpread = (documentId: MaybeRefOrGetter<string>) => {
  const { provides } = useSpreadCapability();
  const spreadMode = ref<SpreadMode>(initialDocumentState.spreadMode);

  watch(
    [provides, () => toValue(documentId)],
    ([providesValue, docId], _, onCleanup) => {
      if (!providesValue) {
        spreadMode.value = initialDocumentState.spreadMode;
        return;
      }

      const scope = providesValue.forDocument(docId);

      // Set initial spread mode
      spreadMode.value = scope.getSpreadMode();

      // Subscribe to spread mode changes
      const unsubscribe = scope.onSpreadChange((newSpreadMode) => {
        spreadMode.value = newSpreadMode;
      });

      onCleanup(unsubscribe);
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
    spreadMode: readonly(spreadMode),
  };
};
