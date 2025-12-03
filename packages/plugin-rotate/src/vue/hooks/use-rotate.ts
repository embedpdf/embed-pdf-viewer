import { ref, watch, readonly, computed, toValue, type MaybeRefOrGetter } from 'vue';
import { useCapability, usePlugin } from '@embedpdf/core/vue';
import { RotatePlugin, initialDocumentState } from '@embedpdf/plugin-rotate';
import { Rotation } from '@embedpdf/models';

/**
 * Hook to get the raw rotate plugin instance.
 */
export const useRotatePlugin = () => usePlugin<RotatePlugin>(RotatePlugin.id);

/**
 * Hook to get the rotate plugin's capability API.
 * This provides methods for rotating the document.
 */
export const useRotateCapability = () => useCapability<RotatePlugin>(RotatePlugin.id);

/**
 * Hook that provides reactive rotation state and methods for a specific document.
 * @param documentId Document ID (can be ref, computed, getter, or plain value)
 */
export const useRotate = (documentId: MaybeRefOrGetter<string>) => {
  const { provides } = useRotateCapability();
  const rotation = ref<Rotation>(initialDocumentState.rotation);

  watch(
    [provides, () => toValue(documentId)],
    ([providesValue, docId], _, onCleanup) => {
      if (!providesValue) {
        rotation.value = initialDocumentState.rotation;
        return;
      }

      const scope = providesValue.forDocument(docId);

      // Get initial state
      rotation.value = scope.getRotation();

      // Subscribe to rotation changes
      const unsubscribe = scope.onRotateChange((newRotation) => {
        rotation.value = newRotation;
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
    rotation: readonly(rotation),
    provides: scopedProvides,
  };
};
