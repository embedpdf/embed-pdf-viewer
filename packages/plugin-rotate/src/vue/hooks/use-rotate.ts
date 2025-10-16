import { ref, watchEffect, readonly, computed } from 'vue';
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
 * @param documentId Document ID
 */
export const useRotate = (documentId: string) => {
  const { provides } = useRotateCapability();
  const rotation = ref<Rotation>(initialDocumentState.rotation);

  watchEffect((onCleanup) => {
    if (provides.value) {
      const scope = provides.value.forDocument(documentId);

      // Get initial state
      rotation.value = scope.getRotation();

      // Subscribe to rotation changes
      const unsubscribe = scope.onRotateChange((newRotation) => {
        rotation.value = newRotation;
      });
      onCleanup(unsubscribe);
    }
  });

  // Return a computed ref for the scoped capability
  const scopedProvides = computed(() => provides.value?.forDocument(documentId) ?? null);

  return {
    rotation: readonly(rotation),
    provides: scopedProvides,
  };
};
