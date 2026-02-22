import { useCapability, usePlugin } from '@embedpdf/core/svelte';
import {
  LayoutAnalysisPlugin,
  LayoutAnalysisState,
  LayoutAnalysisScope,
  PageAnalysisState,
} from '@embedpdf/plugin-layout-analysis';
import { initialState } from '../../lib/reducer';

export const useLayoutAnalysisPlugin = () =>
  usePlugin<LayoutAnalysisPlugin>(LayoutAnalysisPlugin.id);
export const useLayoutAnalysisCapability = () =>
  useCapability<LayoutAnalysisPlugin>(LayoutAnalysisPlugin.id);

interface UseLayoutAnalysisReturn {
  pages: Record<number, PageAnalysisState>;
  layoutOverlayVisible: boolean;
  tableStructureOverlayVisible: boolean;
  tableStructureEnabled: boolean;
  layoutThreshold: number;
  tableStructureThreshold: number;
  selectedBlockId: string | null;
  scope: LayoutAnalysisScope | null;
  provides: LayoutAnalysisPlugin['provides'] extends () => infer R ? R : never;
}

export const useLayoutAnalysis = (getDocumentId: () => string | null): UseLayoutAnalysisReturn => {
  const capability = useLayoutAnalysisCapability();

  let state = $state<LayoutAnalysisState>(initialState);

  const documentId = $derived(getDocumentId());

  const scopedProvides = $derived(
    capability.provides && documentId ? capability.provides.forDocument(documentId) : null,
  );

  $effect(() => {
    const provides = capability.provides;
    const docId = documentId;

    if (!provides || !docId) {
      state = initialState;
      return;
    }

    const scope = provides.forDocument(docId);
    state = scope.getState();

    return scope.onStateChange((newState) => {
      state = newState;
    });
  });

  return {
    get pages() {
      return documentId ? (state.documents[documentId]?.pages ?? {}) : {};
    },
    get layoutOverlayVisible() {
      return state.layoutOverlayVisible;
    },
    get tableStructureOverlayVisible() {
      return state.tableStructureOverlayVisible;
    },
    get tableStructureEnabled() {
      return state.tableStructureEnabled;
    },
    get layoutThreshold() {
      return state.layoutThreshold;
    },
    get tableStructureThreshold() {
      return state.tableStructureThreshold;
    },
    get selectedBlockId() {
      return state.selectedBlockId;
    },
    get scope() {
      return scopedProvides;
    },
    get provides() {
      return capability.provides;
    },
  };
};
