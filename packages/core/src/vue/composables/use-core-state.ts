import { ref, watch } from 'vue';
import { type CoreState } from '@embedpdf/core';
import { useRegistry } from './use-registry';

/**
 * Hook that provides access to the current core state
 * and re-renders the component only when the core state changes
 */
export function useCoreState() {
  const { registry } = useRegistry();
  const coreState = ref<CoreState | null>(null);

  watch(
    registry,
    (registryValue, _, onCleanup) => {
      if (!registryValue) {
        coreState.value = null;
        return;
      }

      const store = registryValue.getStore();

      // Get initial core state
      coreState.value = store.getState().core;

      // Create a single subscription that handles all core actions
      const unsubscribe = store.subscribe((action, newState, oldState) => {
        // Only update if it's a core action and the core state changed
        if (store.isCoreAction(action) && newState.core !== oldState.core) {
          coreState.value = newState.core;
        }
      });

      onCleanup(unsubscribe);
    },
    { immediate: true },
  );

  return coreState;
}
