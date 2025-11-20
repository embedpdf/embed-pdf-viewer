import { Ref } from 'vue';
import { type CoreState } from '@embedpdf/core';
import { useRegistry } from './use-registry';

/**
 * Hook that provides access to the current core state.
 *
 * Note: This reads from the context which is already subscribed to core state changes
 * in the EmbedPDF component, so there's no additional subscription overhead.
 */
export function useCoreState(): Ref<CoreState | null> {
  const { coreState } = useRegistry();
  return coreState;
}
