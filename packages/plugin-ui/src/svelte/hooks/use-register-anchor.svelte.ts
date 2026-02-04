import { onDestroy } from 'svelte';
import { useAnchorRegistry } from '../registries/anchor-registry.svelte';

/**
 * Register a DOM element as an anchor for menus
 *
 * @param getDocumentId - Function returning document ID
 * @param getItemId - Function returning item ID (typically matches the toolbar/menu item ID)
 * @returns Function to attach to the element via use:action
 *
 * @example
 *
 * <script lang="ts">
 *   const registerAnchor = useRegisterAnchor(() => documentId, () => 'zoom-button');
 * </script>
 *
 * <button use:registerAnchor>Zoom</button>
 *  */
export function useRegisterAnchor(getDocumentId: () => string | null, getItemId: () => string) {
  const registry = useAnchorRegistry();
  let currentElement = $state<HTMLElement | null>(null);

  // Reactive values - these update when the functions return different values
  const documentId = $derived(getDocumentId());
  const itemId = $derived(getItemId());

  // Re-register anchor when documentId, itemId, or element changes
  $effect(() => {
    const docId = documentId;
    const item = itemId;
    const element = currentElement;

    // Only register if we have all required values
    if (element && docId && item) {
      registry.register(docId, item, element);

      // Cleanup: unregister when effect re-runs or component unmounts
      return () => {
        registry.unregister(docId, item);
      };
    }
  });

  // Svelte action function
  const action = (element: HTMLElement) => {
    currentElement = element;

    return {
      destroy() {
        // Clear the element reference when the action is destroyed
        currentElement = null;
      },
    };
  };

  return action;
}
