import { useCapability, usePlugin } from '@embedpdf/core/svelte';
import { ExportPlugin } from '@embedpdf/plugin-export';

export const useExportPlugin = () => usePlugin<ExportPlugin>(ExportPlugin.id);
export const useExportCapability = () => useCapability<ExportPlugin>(ExportPlugin.id);
