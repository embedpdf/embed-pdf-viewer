import { HistoryPlugin } from '@embedpdf/plugin-history';
import { useCapability, usePlugin } from '@embedpdf/core/svelte';

export const useHistoryCapability = () => useCapability<HistoryPlugin>(HistoryPlugin.id);
export const useHistoryPlugin = () => usePlugin<HistoryPlugin>(HistoryPlugin.id);
