import { useCapability, usePlugin } from '@embedpdf/core/svelte';
import { Rotation } from '@embedpdf/models';
import { RotatePlugin, initialDocumentState } from '@embedpdf/plugin-rotate';

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
  const capability = useRotateCapability();

  let rotation = $state<Rotation>(initialDocumentState.rotation);

  // Derived scoped capability for the specific document
  const scopedProvides = $derived(capability.provides?.forDocument(documentId) ?? null);

  $effect(() => {
    if (!capability.provides) {
      rotation = initialDocumentState.rotation;
      return;
    }

    const scope = capability.provides.forDocument(documentId);

    // Get initial state
    rotation = scope.getRotation();

    // Subscribe to rotation changes for this document
    return scope.onRotateChange((newRotation) => {
      rotation = newRotation;
    });
  });

  return {
    get rotation() {
      return rotation;
    },
    get provides() {
      return scopedProvides;
    },
  };
};
