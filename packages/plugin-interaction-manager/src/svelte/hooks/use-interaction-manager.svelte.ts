import { useCapability, usePlugin } from '@embedpdf/core/svelte';
import {
  initialDocumentState,
  InteractionDocumentState,
  InteractionManagerPlugin,
  PointerEventHandlersWithLifecycle,
} from '@embedpdf/plugin-interaction-manager';

export const useInteractionManagerPlugin = () =>
  usePlugin<InteractionManagerPlugin>(InteractionManagerPlugin.id);
export const useInteractionManagerCapability = () =>
  useCapability<InteractionManagerPlugin>(InteractionManagerPlugin.id);

export function useInteractionManager(documentId: string) {
  const capability = useInteractionManagerCapability();

  let state = $state<InteractionDocumentState>(initialDocumentState);

  // Derived scoped capability for the specific document
  const scopedProvides = $derived(capability.provides?.forDocument(documentId) ?? null);

  $effect(() => {
    if (!capability.provides) {
      state = initialDocumentState;
      return;
    }

    const scope = capability.provides.forDocument(documentId);

    // Get initial state
    state = scope.getState();

    return scope.onStateChange((newState) => {
      state = newState;
    });
  });

  return {
    get state() {
      return state;
    },
    get provides() {
      return scopedProvides;
    },
  };
}

export function useCursor(documentId: string) {
  const capability = useInteractionManagerCapability();

  return {
    setCursor: (token: string, cursor: string, prio = 0) => {
      if (!capability.provides) return;
      const scope = capability.provides.forDocument(documentId);
      scope.setCursor(token, cursor, prio);
    },
    removeCursor: (token: string) => {
      if (!capability.provides) return;
      const scope = capability.provides.forDocument(documentId);
      scope.removeCursor(token);
    },
  };
}

interface UsePointerHandlersOptions {
  modeId?: string | string[];
  pageIndex?: number;
  documentId: string;
}

export function usePointerHandlers({ modeId, pageIndex, documentId }: UsePointerHandlersOptions) {
  const capability = useInteractionManagerCapability();

  return {
    register: (
      handlers: PointerEventHandlersWithLifecycle,
      options?: { modeId?: string | string[]; pageIndex?: number; documentId?: string },
    ) => {
      // Use provided options or fall back to hook-level options
      const finalModeId = options?.modeId ?? modeId;
      const finalPageIndex = options?.pageIndex ?? pageIndex;
      const finalDocumentId = options?.documentId ?? documentId;

      return finalModeId
        ? capability.provides?.registerHandlers({
            modeId: finalModeId,
            handlers,
            pageIndex: finalPageIndex,
            documentId: finalDocumentId,
          })
        : capability.provides?.registerAlways({
            scope:
              finalPageIndex !== undefined
                ? { type: 'page', documentId: finalDocumentId, pageIndex: finalPageIndex }
                : { type: 'global', documentId: finalDocumentId },
            handlers,
          });
    },
  };
}

export function useIsPageExclusive(documentId: string) {
  const capability = useInteractionManagerCapability();

  let isPageExclusive = $state<boolean>(false);

  $effect(() => {
    if (!capability.provides) {
      isPageExclusive = false;
      return;
    }

    const scope = capability.provides.forDocument(documentId);

    // Get initial state
    const m = scope.getActiveInteractionMode();
    isPageExclusive = m?.scope === 'page' && !!m.exclusive;

    return scope.onModeChange(() => {
      const mode = scope.getActiveInteractionMode();
      isPageExclusive = mode?.scope === 'page' && !!mode?.exclusive;
    });
  });

  return {
    get current() {
      return isPageExclusive;
    },
  };
}
