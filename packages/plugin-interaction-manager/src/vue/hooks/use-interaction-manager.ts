import { useCapability, usePlugin } from '@embedpdf/core/vue';
import {
  initialDocumentState,
  InteractionDocumentState,
  InteractionManagerPlugin,
  PointerEventHandlersWithLifecycle,
} from '@embedpdf/plugin-interaction-manager';
import { ref, watchEffect, readonly } from 'vue';

export const useInteractionManagerPlugin = () =>
  usePlugin<InteractionManagerPlugin>(InteractionManagerPlugin.id);
export const useInteractionManagerCapability = () =>
  useCapability<InteractionManagerPlugin>(InteractionManagerPlugin.id);

/**
 * Hook for interaction manager state for a specific document
 * @param documentId Document ID
 */
export function useInteractionManager(documentId: string) {
  const { provides } = useInteractionManagerCapability();
  const state = ref<InteractionDocumentState>(initialDocumentState);

  watchEffect((onCleanup) => {
    if (provides.value) {
      const scope = provides.value.forDocument(documentId);

      // Get initial state
      state.value = {
        activeMode: scope.getActiveMode(),
        cursor: scope.getCurrentCursor(),
        paused: scope.isPaused(),
      };

      // Subscribe to state changes
      const unsubscribe = scope.onStateChange((newState) => {
        state.value = newState;
      });
      onCleanup(unsubscribe);
    }
  });

  return {
    provides: provides.value?.forDocument(documentId) ?? null,
    state: readonly(state),
  };
}

/**
 * Hook to check if page is exclusive for a specific document
 * @param documentId Document ID
 */
export function useIsPageExclusive(documentId: string) {
  const { provides: cap } = useInteractionManagerCapability();
  const isPageExclusive = ref<boolean>(false);

  watchEffect((onCleanup) => {
    if (cap.value) {
      const scope = cap.value.forDocument(documentId);

      // Set initial state
      const mode = scope.getActiveInteractionMode();
      isPageExclusive.value = mode?.scope === 'page' && !!mode?.exclusive;

      // Subscribe to mode changes
      const unsubscribe = scope.onModeChange(() => {
        const newMode = scope.getActiveInteractionMode();
        isPageExclusive.value = newMode?.scope === 'page' && !!newMode?.exclusive;
      });
      onCleanup(unsubscribe);
    }
  });

  return readonly(isPageExclusive);
}

/**
 * Hook for cursor management for a specific document
 * @param documentId Document ID
 */
export function useCursor(documentId: string) {
  const { provides } = useInteractionManagerCapability();

  return {
    setCursor: (token: string, cursorValue: string, prio = 0) => {
      if (!provides.value) return;
      const scope = provides.value.forDocument(documentId);
      scope.setCursor(token, cursorValue, prio);
    },
    removeCursor: (token: string) => {
      if (!provides.value) return;
      const scope = provides.value.forDocument(documentId);
      scope.removeCursor(token);
    },
  };
}

interface UsePointerHandlersOptions {
  documentId: string;
  modeId?: string | string[];
  pageIndex?: number;
}

/**
 * Hook for registering pointer handlers
 * @param options Options including documentId, modeId, and pageIndex
 */
export function usePointerHandlers({ documentId, modeId, pageIndex }: UsePointerHandlersOptions) {
  const { provides } = useInteractionManagerCapability();

  return {
    register: (
      handlers: PointerEventHandlersWithLifecycle,
      options?: { documentId?: string; modeId?: string | string[]; pageIndex?: number },
    ) => {
      if (!provides.value) return;

      // Use provided options or fall back to hook-level options
      const finalDocumentId = options?.documentId ?? documentId;
      const finalModeId = options?.modeId ?? modeId;
      const finalPageIndex = options?.pageIndex ?? pageIndex;

      if (!finalDocumentId) {
        throw new Error('documentId is required for registering handlers');
      }

      return finalModeId
        ? provides.value.registerHandlers({
            documentId: finalDocumentId,
            modeId: finalModeId,
            handlers,
            pageIndex: finalPageIndex,
          })
        : provides.value.registerAlways({
            scope:
              finalPageIndex !== undefined
                ? { type: 'page', documentId: finalDocumentId, pageIndex: finalPageIndex }
                : { type: 'global', documentId: finalDocumentId },
            handlers,
          });
    },
  };
}

/**
 * Hook to get the active mode for a specific document
 * @param documentId Document ID
 */
export function useActiveMode(documentId: string) {
  const { provides } = useInteractionManagerCapability();
  const activeMode = ref<string>('pointerMode');

  watchEffect((onCleanup) => {
    if (provides.value) {
      const scope = provides.value.forDocument(documentId);

      // Set initial mode
      activeMode.value = scope.getActiveMode();

      // Subscribe to mode changes
      const unsubscribe = scope.onModeChange((mode) => {
        activeMode.value = mode;
      });
      onCleanup(unsubscribe);
    }
  });

  return readonly(activeMode);
}
