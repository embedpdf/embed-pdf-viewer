import { useCapability, usePlugin } from '@embedpdf/core/svelte';
import { GateChangeEvent, ScrollActivity, ViewportPlugin } from '@embedpdf/plugin-viewport';

export const useViewportPlugin = () => usePlugin<ViewportPlugin>(ViewportPlugin.id);
export const useViewportCapability = () => useCapability<ViewportPlugin>(ViewportPlugin.id);

/**
 * Hook to get the gated state of the viewport for a specific document.
 * The viewport children are not rendered when gated.
 * @param getDocumentId Function that returns the document ID
 */
export const useIsViewportGated = (getDocumentId: () => string | null) => {
  const capability = useViewportCapability();

  let isGated = $state(false);

  // Reactive documentId
  const documentId = $derived(getDocumentId());

  $effect(() => {
    const provides = capability.provides;
    const docId = documentId;

    if (!provides || !docId) {
      isGated = false;
      return;
    }

    // Set initial state
    isGated = provides.isGated(docId);

    // Subscribe to gate state changes
    return provides.onGateChange((event: GateChangeEvent) => {
      if (event.documentId === docId) {
        isGated = event.isGated;
      }
    });
  });

  return {
    get current() {
      return isGated;
    },
  };
};

/**
 * Hook to get scroll activity for a specific document
 * @param getDocumentId Function that returns the document ID
 */
export const useViewportScrollActivity = (getDocumentId: () => string | null) => {
  const capability = useViewportCapability();

  let scrollActivity = $state<ScrollActivity>({
    isScrolling: false,
    isSmoothScrolling: false,
  });

  // Reactive documentId
  const documentId = $derived(getDocumentId());

  $effect(() => {
    const provides = capability.provides;
    const docId = documentId;

    if (!provides || !docId) {
      scrollActivity = {
        isScrolling: false,
        isSmoothScrolling: false,
      };
      return;
    }

    // Subscribe to scroll activity events
    return provides.onScrollActivity((event) => {
      // Filter by documentId
      if (event.documentId === docId) {
        scrollActivity = event.activity;
      }
    });
  });

  return {
    get current() {
      return scrollActivity;
    },
  };
};
