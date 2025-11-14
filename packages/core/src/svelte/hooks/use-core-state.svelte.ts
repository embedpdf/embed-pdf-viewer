import { type CoreState } from '@embedpdf/core';
import { useRegistry } from './use-registry.svelte';

/**
 * Hook that provides access to the current core state
 * and re-renders the component only when the core state changes
 */
export function useCoreState() {
  const { registry } = useRegistry();

  let coreState = $state<CoreState | null>(null);

  $effect(() => {
    if (!registry) {
      coreState = null;
      return;
    }

    const store = registry.getStore();

    // Get initial core state
    coreState = store.getState().core;

    // Create a single subscription that handles all core actions
    return store.subscribe((action, newState, oldState) => {
      // Only update if it's a core action and the core state changed
      if (store.isCoreAction(action) && newState.core !== oldState.core) {
        coreState = newState.core;
      }
    });
  });

  return {
    get current() {
      return coreState;
    },
  };
}
