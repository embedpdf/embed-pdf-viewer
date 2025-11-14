import { useCapability, usePlugin } from '@embedpdf/core/@framework';
import {
  initialDocumentState,
  InteractionDocumentState,
  InteractionManagerPlugin,
  PointerEventHandlersWithLifecycle,
} from '@embedpdf/plugin-interaction-manager';
import { useState, useEffect } from '@framework';

export const useInteractionManagerPlugin = () =>
  usePlugin<InteractionManagerPlugin>(InteractionManagerPlugin.id);
export const useInteractionManagerCapability = () =>
  useCapability<InteractionManagerPlugin>(InteractionManagerPlugin.id);

export function useInteractionManager(documentId: string) {
  const { provides } = useInteractionManagerCapability();
  const [state, setState] = useState<InteractionDocumentState>(initialDocumentState);

  useEffect(() => {
    if (!provides) return;
    const scope = provides.forDocument(documentId);
    return scope.onStateChange((state) => {
      setState(state);
    });
  }, [provides]);

  return {
    provides: provides?.forDocument(documentId) ?? null,
    state,
  };
}

export function useCursor(documentId: string) {
  const { provides } = useInteractionManagerCapability();
  return {
    setCursor: (token: string, cursor: string, prio = 0) => {
      if (!provides) return;
      const scope = provides.forDocument(documentId);
      scope.setCursor(token, cursor, prio);
    },
    removeCursor: (token: string) => {
      if (!provides) return;
      const scope = provides.forDocument(documentId);
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
  const { provides } = useInteractionManagerCapability();
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
        ? provides?.registerHandlers({
            modeId: finalModeId,
            handlers,
            pageIndex: finalPageIndex,
            documentId: finalDocumentId,
          })
        : provides?.registerAlways({
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
  const { provides: cap } = useInteractionManagerCapability();

  const [isPageExclusive, setIsPageExclusive] = useState<boolean>(() => {
    if (!cap) return false;
    const scope = cap.forDocument(documentId);
    const m = scope.getActiveInteractionMode();
    return m?.scope === 'page' && !!m.exclusive;
  });

  useEffect(() => {
    if (!cap) return;

    const scope = cap.forDocument(documentId);

    return scope.onModeChange(() => {
      const mode = scope.getActiveInteractionMode();
      setIsPageExclusive(mode?.scope === 'page' && !!mode?.exclusive);
    });
  }, [cap, documentId]);

  return isPageExclusive;
}
