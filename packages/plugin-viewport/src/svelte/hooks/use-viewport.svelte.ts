import { useCapability, usePlugin } from '@embedpdf/core/svelte';
import { GateChangeEvent, ScrollActivity, ViewportPlugin } from '@embedpdf/plugin-viewport';

export const useViewportPlugin = () => usePlugin<ViewportPlugin>(ViewportPlugin.id);
export const useViewportCapability = () => useCapability<ViewportPlugin>(ViewportPlugin.id);

/**
 * Hook to get the gated state of the viewport for a specific document.
 * The viewport children are not rendered when gated.
 * @param documentId Document ID.
 */
export const useIsViewportGated = (documentId: string) => {
  const capability = useViewportCapability();

  let isGated = $state(false);

  $effect(() => {
    if (!capability.provides) {
      isGated = false;
      return;
    }

    // Set initial state
    isGated = capability.provides.isGated(documentId);

    // Subscribe to gate state changes
    return capability.provides.onGateChange((event: GateChangeEvent) => {
      if (event.documentId === documentId) {
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
 * @param documentId Document ID.
 */
export const useViewportScrollActivity = (documentId: string) => {
  const capability = useViewportCapability();

  let scrollActivity = $state<ScrollActivity>({
    isScrolling: false,
    isSmoothScrolling: false,
  });

  $effect(() => {
    if (!capability.provides) {
      scrollActivity = {
        isScrolling: false,
        isSmoothScrolling: false,
      };
      return;
    }

    // Subscribe to scroll activity events
    return capability.provides.onScrollActivity((event) => {
      // Filter by documentId
      if (event.documentId === documentId) {
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
