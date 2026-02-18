import { useCapability, usePlugin } from '@embedpdf/core/@framework';
import { useState, useEffect, useMemo } from '@framework';
import {
  LayoutAnalysisPlugin,
  LayoutAnalysisState,
  PageAnalysisState,
} from '@embedpdf/plugin-layout-analysis';
import { initialState } from '../../lib/reducer';

export const useLayoutAnalysisPlugin = () =>
  usePlugin<LayoutAnalysisPlugin>(LayoutAnalysisPlugin.id);
export const useLayoutAnalysisCapability = () =>
  useCapability<LayoutAnalysisPlugin>(LayoutAnalysisPlugin.id);

export const useLayoutAnalysis = (documentId: string) => {
  const { provides } = useLayoutAnalysisCapability();
  const [state, setState] = useState<LayoutAnalysisState>(initialState);

  const scope = useMemo(() => provides?.forDocument(documentId), [provides, documentId]);

  useEffect(() => {
    if (!scope) return;
    setState(scope.getState());
    return scope.onStateChange((newState) => {
      setState(newState);
    });
  }, [scope]);

  const pages: Record<number, PageAnalysisState> = state.documents[documentId]?.pages ?? {};

  return {
    pages,
    layoutOverlayVisible: state.layoutOverlayVisible,
    tableStructureOverlayVisible: state.tableStructureOverlayVisible,
    tableStructureEnabled: state.tableStructureEnabled,
    layoutThreshold: state.layoutThreshold,
    tableStructureThreshold: state.tableStructureThreshold,
    selectedBlockId: state.selectedBlockId,
    scope,
    provides,
  };
};
