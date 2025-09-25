import { useCapability, usePlugin } from '@embedpdf/core/@framework';
import {
  initialState,
  InteractionManagerPlugin,
  InteractionManagerState,
  PointerEventHandlersWithLifecycle,
} from '@embedpdf/plugin-interaction-manager';
import { useState, useEffect } from '@framework';

export const useInteractionManagerPlugin = () =>
  usePlugin<InteractionManagerPlugin>(InteractionManagerPlugin.id);
export const useInteractionManagerCapability = () =>
  useCapability<InteractionManagerPlugin>(InteractionManagerPlugin.id);

export function useInteractionManager() {
  const { provides } = useInteractionManagerCapability();
  const [state, setState] = useState<InteractionManagerState>(initialState);

  useEffect(() => {
    if (!provides) return;
    return provides.onStateChange((state) => {
      setState(state);
    });
  }, [provides]);

  return {
    provides,
    state,
  };
}

export function useCursor() {
  const { provides } = useInteractionManagerCapability();
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
  const { provides } = useInteractionManagerCapability();
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
  const { provides: cap } = useInteractionManagerCapability();

  const [isPageExclusive, setIsPageExclusive] = useState<boolean>(() => {
    const m = cap?.getActiveInteractionMode();
    return m?.scope === 'page' && !!m.exclusive;
  });

  useEffect(() => {
    if (!cap) return;

    return cap.onModeChange(() => {
      const mode = cap.getActiveInteractionMode();
      setIsPageExclusive(mode?.scope === 'page' && !!mode?.exclusive);
    });
  }, [cap]);

  return isPageExclusive;
}
