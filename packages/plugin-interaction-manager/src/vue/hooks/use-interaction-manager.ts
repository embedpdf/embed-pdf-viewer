import { ref, watch, computed, toValue, type MaybeRefOrGetter } from 'vue';
import { useCapability, usePlugin } from '@embedpdf/core/vue';
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

export function useInteractionManager(documentId: MaybeRefOrGetter<string>) {
  const { provides } = useInteractionManagerCapability();
  const state = ref<InteractionDocumentState>(initialDocumentState);

  watch(
    [provides, () => toValue(documentId)],
    ([providesValue, docId], _, onCleanup) => {
      if (!providesValue) {
        state.value = initialDocumentState;
        return;
      }

      const scope = providesValue.forDocument(docId);

      // Get initial state
      state.value = scope.getState();

      const unsubscribe = scope.onStateChange((newState) => {
        state.value = newState;
      });

      onCleanup(unsubscribe);
    },
    { immediate: true },
  );

  return {
    provides: computed(() => {
      const docId = toValue(documentId);
      return provides.value?.forDocument(docId) ?? null;
    }),
    state,
  };
}

export function useCursor(documentId: MaybeRefOrGetter<string>) {
  const { provides } = useInteractionManagerCapability();

  return {
    setCursor: (token: string, cursor: string, prio = 0) => {
      const providesValue = provides.value;
      if (!providesValue) return;
      const docId = toValue(documentId);
      const scope = providesValue.forDocument(docId);
      scope.setCursor(token, cursor, prio);
    },
    removeCursor: (token: string) => {
      const providesValue = provides.value;
      if (!providesValue) return;
      const docId = toValue(documentId);
      const scope = providesValue.forDocument(docId);
      scope.removeCursor(token);
    },
  };
}

interface UsePointerHandlersOptions {
  modeId?: string | string[];
  pageIndex?: MaybeRefOrGetter<number>;
  documentId: MaybeRefOrGetter<string>;
}

export function usePointerHandlers({ modeId, pageIndex, documentId }: UsePointerHandlersOptions) {
  const { provides } = useInteractionManagerCapability();

  return {
    register: (
      handlers: PointerEventHandlersWithLifecycle,
      options?: {
        modeId?: string | string[];
        pageIndex?: number;
        documentId?: MaybeRefOrGetter<string>;
      },
    ) => {
      // Use provided options or fall back to hook-level options
      const finalModeId = options?.modeId ?? modeId;
      const finalPageIndex = toValue(options?.pageIndex ?? pageIndex);
      const finalDocumentId = toValue(options?.documentId ?? documentId);
      const providesValue = provides.value;

      return finalModeId
        ? providesValue?.registerHandlers({
            modeId: finalModeId,
            handlers,
            pageIndex: finalPageIndex,
            documentId: finalDocumentId,
          })
        : providesValue?.registerAlways({
            scope:
              finalPageIndex !== undefined
                ? { type: 'page', documentId: finalDocumentId, pageIndex: finalPageIndex }
                : { type: 'global', documentId: finalDocumentId },
            handlers,
          });
    },
  };
}

export function useIsPageExclusive(documentId: MaybeRefOrGetter<string>) {
  const { provides: cap } = useInteractionManagerCapability();
  const isPageExclusive = ref<boolean>(false);

  watch(
    [cap, () => toValue(documentId)],
    ([capValue, docId], _, onCleanup) => {
      if (!capValue) {
        isPageExclusive.value = false;
        return;
      }

      const scope = capValue.forDocument(docId);

      // Get initial state
      const m = scope.getActiveInteractionMode();
      isPageExclusive.value = m?.scope === 'page' && !!m.exclusive;

      const unsubscribe = scope.onModeChange(() => {
        const mode = scope.getActiveInteractionMode();
        isPageExclusive.value = mode?.scope === 'page' && !!mode?.exclusive;
      });

      onCleanup(unsubscribe);
    },
    { immediate: true },
  );

  return isPageExclusive;
}
