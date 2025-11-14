import { useState, useEffect } from '@framework';
import { CoreState } from '@embedpdf/core';
import { useRegistry } from './use-registry';

/**
 * Hook that provides access to the current core state
 * and re-renders the component only when the core state changes
 */
export function useCoreState(): CoreState | null {
  const { registry } = useRegistry();
  const [coreState, setCoreState] = useState<CoreState | null>(null);

  useEffect(() => {
    if (!registry) return;

    const store = registry.getStore();

    // Get initial core state
    setCoreState(store.getState().core);

    // Create a single subscription that handles all core actions
    const unsubscribe = store.subscribe((action, newState, oldState) => {
      // Only update if it's a core action and the core state changed
      if (store.isCoreAction(action) && newState.core !== oldState.core) {
        setCoreState(newState.core);
      }
    });

    return () => unsubscribe();
  }, [registry]);

  return coreState;
}
