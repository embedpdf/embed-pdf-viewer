import { useCapability, usePlugin } from '@embedpdf/core/svelte';
import {
  CapturePlugin,
  CaptureDocumentState,
  initialDocumentState,
} from '@embedpdf/plugin-capture';

export const useCaptureCapability = () => useCapability<CapturePlugin>(CapturePlugin.id);
export const useCapturePlugin = () => usePlugin<CapturePlugin>(CapturePlugin.id);

/**
 * Hook for capture state for a specific document
 * @param documentId Document ID
 */
export const useCapture = (documentId: string) => {
  const capability = useCaptureCapability();

  let state = $state<CaptureDocumentState>(initialDocumentState);

  // Derived scoped capability for the specific document
  const scopedProvides = $derived(capability.provides?.forDocument(documentId) ?? null);

  $effect(() => {
    if (!capability.provides) {
      state = initialDocumentState;
      return;
    }

    const scope = capability.provides.forDocument(documentId);

    // Get initial state
    state = scope.getState();

    // Subscribe to state changes for this document
    return scope.onStateChange((newState) => {
      state = newState;
    });
  });

  return {
    get state() {
      return state;
    },
    get provides() {
      return scopedProvides;
    },
  };
};
