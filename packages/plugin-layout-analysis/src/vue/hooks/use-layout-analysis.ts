import { useCapability, usePlugin } from '@embedpdf/core/vue';
import {
  LayoutAnalysisPlugin,
  LayoutAnalysisState,
  PageAnalysisState,
} from '@embedpdf/plugin-layout-analysis';
import { initialState } from '../../lib/reducer';
import { ref, watch, toValue, MaybeRefOrGetter, computed } from 'vue';

export const useLayoutAnalysisPlugin = () =>
  usePlugin<LayoutAnalysisPlugin>(LayoutAnalysisPlugin.id);
export const useLayoutAnalysisCapability = () =>
  useCapability<LayoutAnalysisPlugin>(LayoutAnalysisPlugin.id);

export const useLayoutAnalysis = (documentId: MaybeRefOrGetter<string>) => {
  const { provides } = useLayoutAnalysisCapability();
  const state = ref<LayoutAnalysisState>(initialState);

  watch(
    [provides, () => toValue(documentId)],
    ([providesValue, docId], _, onCleanup) => {
      if (providesValue && docId) {
        const scope = providesValue.forDocument(docId);
        state.value = scope.getState();

        const unsubscribe = scope.onStateChange((newState) => {
          state.value = newState;
        });
        onCleanup(unsubscribe);
      }
    },
    { immediate: true },
  );

  return {
    pages: computed(
      (): Record<number, PageAnalysisState> =>
        state.value.documents[toValue(documentId)]?.pages ?? {},
    ),
    layoutOverlayVisible: computed(() => state.value.layoutOverlayVisible),
    tableStructureOverlayVisible: computed(() => state.value.tableStructureOverlayVisible),
    tableStructureEnabled: computed(() => state.value.tableStructureEnabled),
    layoutThreshold: computed(() => state.value.layoutThreshold),
    tableStructureThreshold: computed(() => state.value.tableStructureThreshold),
    selectedBlockId: computed(() => state.value.selectedBlockId),
    scope: computed(() => provides.value?.forDocument(toValue(documentId)) ?? null),
    provides,
  };
};
