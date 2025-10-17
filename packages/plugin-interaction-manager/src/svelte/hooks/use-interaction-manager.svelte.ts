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
  const { provides } = $derived(useInteractionManagerCapability());
  let interactionManagerState = $state<InteractionManagerState>(initialState);

  $effect(() => {
    if (!provides) return;
    return provides.onStateChange((state) => {
      interactionManagerState = state;
    });
  });

  return {
    get provides() {
      return provides;
    },
    get state() {
      return interactionManagerState;
    },
  };
}

export function useCursor() {
  const { provides } = $derived(useInteractionManagerCapability());
  return {
    setCursor: (token: string, cursor: string, prio = 0) => {
      provides?.setCursor(token, cursor, prio);
    },
    removeCursor: (token: string) => {
      provides?.removeCursor(token);
    },
  };
}

interface UsePointerHandlersOptions {
  modeId?: string | string[];
  pageIndex?: number;
}

export function usePointerHandlers({ modeId, pageIndex }: UsePointerHandlersOptions) {
  const { provides } = $derived(useInteractionManagerCapability());
  return {
    register: (
      handlers: PointerEventHandlersWithLifecycle,
      options?: { modeId?: string | string[]; pageIndex?: number },
    ) => {
      // Use provided options or fall back to hook-level options
      const finalModeId = options?.modeId ?? modeId;
      const finalPageIndex = options?.pageIndex ?? pageIndex;

      return finalModeId
        ? provides?.registerHandlers({
            modeId: finalModeId,
            handlers,
            pageIndex: finalPageIndex,
          })
        : provides?.registerAlways({
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
  const { provides: cap } = $derived(useInteractionManagerCapability());
  let isPageExclusive = $derived.by(() => {
    const m = cap?.getActiveInteractionMode();
    return m?.scope === 'page' && !!m.exclusive;
  });

  $effect(() => {
    if (!cap) return;

    return cap.onModeChange(() => {
      const mode = cap.getActiveInteractionMode();
      isPageExclusive = mode?.scope === 'page' && !!mode?.exclusive;
    });
  });

  return {
    get isPageExclusive() {
      return isPageExclusive;
    },
  };
}
