import {
  initialState,
  InteractionManagerPlugin,
  InteractionManagerState,
  PointerEventHandlersWithLifecycle,
} from '@embedpdf/plugin-interaction-manager';
import { useCapability, usePlugin } from '@embedpdf/core/svelte';

export const useInteractionManagerPlugin = () =>
  usePlugin<InteractionManagerPlugin>(InteractionManagerPlugin.id);
export const useInteractionManagerCapability = () =>
  useCapability<InteractionManagerPlugin>(InteractionManagerPlugin.id);

export function useInteractionManager() {
  const capability = useInteractionManagerCapability();

  const state = $state({
    get provides() {
      return capability.provides;
    },
    state: initialState as InteractionManagerState,
  });

  $effect(() => {
    if (!capability.provides) return;
    return capability.provides.onStateChange((newState) => {
      state.state = newState;
    });
  });

  return state;
}

export function useCursor() {
  const capability = useInteractionManagerCapability();

  const state = $state({
    setCursor: (token: string, cursor: string, prio = 0) => {
      capability.provides?.setCursor(token, cursor, prio);
    },
    removeCursor: (token: string) => {
      capability.provides?.removeCursor(token);
    },
  });

  return state;
}

interface UsePointerHandlersOptions {
  modeId?: string | string[];
  pageIndex?: number;
}

export function usePointerHandlers({ modeId, pageIndex }: UsePointerHandlersOptions = {}) {
  const capability = useInteractionManagerCapability();

  return {
    register: (
      handlers: PointerEventHandlersWithLifecycle,
      options?: { modeId?: string | string[]; pageIndex?: number },
    ) => {
      // Use provided options or fall back to hook-level options
      const finalModeId = options?.modeId ?? modeId;
      const finalPageIndex = options?.pageIndex ?? pageIndex;

      return finalModeId
        ? capability.provides?.registerHandlers({
            modeId: finalModeId,
            handlers,
            pageIndex: finalPageIndex,
          })
        : capability.provides?.registerAlways({
            scope:
              finalPageIndex !== undefined
                ? { type: 'page', pageIndex: finalPageIndex }
                : { type: 'global' },
            handlers,
          });
    },
  };
}

export function useIsPageExclusive() {
  const capability = useInteractionManagerCapability();

  const state = $state({
    isPageExclusive: false,
  });

  // Initialize and update on changes
  $effect(() => {
    if (!capability.provides) return;

    // Set initial value
    const mode = capability.provides.getActiveInteractionMode();
    state.isPageExclusive = mode?.scope === 'page' && !!mode.exclusive;

    // Listen for changes
    return capability.provides.onModeChange(() => {
      const mode = capability.provides?.getActiveInteractionMode();
      state.isPageExclusive = mode?.scope === 'page' && !!mode?.exclusive;
    });
  });

  return state;
}
