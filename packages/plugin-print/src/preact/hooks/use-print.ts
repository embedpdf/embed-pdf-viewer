import { useCapability, usePlugin } from '@embedpdf/core/preact';
import { PrintPlugin } from '@embedpdf/plugin-print';

export const usePrintPlugin = () => usePlugin<PrintPlugin>(PrintPlugin.id);
export const usePrintCapability = () => useCapability<PrintPlugin>(PrintPlugin.id);
