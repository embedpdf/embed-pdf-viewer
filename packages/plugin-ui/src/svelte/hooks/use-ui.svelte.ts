import { useCapability, usePlugin } from '@embedpdf/core/svelte';
import { UIPlugin, UIDocumentState, UIScope } from '@embedpdf/plugin-ui';

/**
 * Hook to get the raw UI plugin instance.
 */
export const useUIPlugin = () => usePlugin<UIPlugin>(UIPlugin.id);

/**
 * Hook to get the UI plugin's capability API.
 */
export const useUICapability = () => useCapability<UIPlugin>(UIPlugin.id);

// Define the return type explicitly to maintain type safety
interface UseUIStateReturn {
  provides: UIScope | null;
  state: UIDocumentState | null;
}

/**
 * Hook for UI state for a specific document
 * @param getDocumentId Function that returns the document ID
 */
export const useUIState = (getDocumentId: () => string | null): UseUIStateReturn => {
  const capability = useUICapability();

  let state = $state<UIDocumentState | null>(null);

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
      state = null;
      return;
    }

    const scope = provides.forDocument(docId);

    // Set initial state
    state = scope.getState();

    // Subscribe to all changes and update state
    const unsubToolbar = scope.onToolbarChanged(() => {
      state = scope.getState();
    });
    const unsubSidebar = scope.onSidebarChanged(() => {
      state = scope.getState();
    });
    const unsubModal = scope.onModalChanged(() => {
      state = scope.getState();
    });
    const unsubMenu = scope.onMenuChanged(() => {
      state = scope.getState();
    });
    const unsubOverlay = scope.onOverlayChanged(() => {
      state = scope.getState();
    });

    return () => {
      unsubToolbar();
      unsubSidebar();
      unsubModal();
      unsubMenu();
      unsubOverlay();
    };
  });

  return {
    get provides() {
      return scopedProvides;
    },
    get state() {
      return state;
    },
  };
};

/**
 * Hook to get UI schema
 * Returns an object with a reactive getter for the schema
 */
export const useUISchema = () => {
  const capability = useUICapability();

  return {
    get schema() {
      return capability.provides?.getSchema() ?? null;
    },
  };
};
