import { useCapability, usePlugin } from '@embedpdf/core/@framework';
import { LayoutAnalysisPlugin } from '@embedpdf/plugin-layout-analysis';

export const useLayoutAnalysisPlugin = () =>
  usePlugin<LayoutAnalysisPlugin>(LayoutAnalysisPlugin.id);
export const useLayoutAnalysisCapability = () =>
  useCapability<LayoutAnalysisPlugin>(LayoutAnalysisPlugin.id);
