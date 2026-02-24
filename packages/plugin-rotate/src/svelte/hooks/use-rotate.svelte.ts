import { useCapability, usePlugin } from '@embedpdf/core/svelte';
import { Rotation } from '@embedpdf/models';
import { RotatePlugin, initialDocumentState, RotateScope } from '@embedpdf/plugin-rotate';

/**
 * Hook to get the raw rotate plugin instance.
 */
export const useRotatePlugin = () => usePlugin<RotatePlugin>(RotatePlugin.id);

/**
 * Hook to get the rotate plugin's capability API.
 * This provides methods for rotating the document.
 */
export const useRotateCapability = () => useCapability<RotatePlugin>(RotatePlugin.id);

// Define the return type explicitly to maintain type safety
interface UseRotateReturn {
  provides: RotateScope | null;
  rotation: Rotation;
}

/**
 * Hook that provides reactive rotation state and methods for a specific document.
 * @param getDocumentId Function that returns the document ID
 */
export const useRotate = (getDocumentId: () => string | null): UseRotateReturn => {
  const capability = useRotateCapability();

  let rotation = $state<Rotation>(initialDocumentState.rotation);

  // Reactive documentId
  const documentId = $derived(getDocumentId());

  // Scoped capability for current docId
  const scopedProvides = $derived(
    capability.provides && documentId ? capability.provides.forDocument(documentId) : null,
  );

  $effect(() => {
    const provides = capability.provides;
    const docId = documentId;

    if (!provides || !docId) {
      rotation = initialDocumentState.rotation;
      return;
    }

    const scope = provides.forDocument(docId);

    // Get initial state
    rotation = scope.getRotation();

    // Subscribe to rotation changes for this document
    return scope.onRotateChange((newRotation) => {
      rotation = newRotation;
    });
  });

  return {
    get provides() {
      return scopedProvides;
    },
    get rotation() {
      return rotation;
    },
  };
};
