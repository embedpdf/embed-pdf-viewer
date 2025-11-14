import type { PluginRegistry } from '@embedpdf/core';

export interface PDFContextState {
  registry: PluginRegistry | null;
  isInitializing: boolean;
  pluginsReady: boolean;
}

export const pdfContext = $state<PDFContextState>({
  registry: null,
  isInitializing: true,
  pluginsReady: false,
});

/**
 * Hook to access the PDF registry context.
 * @returns The PDF registry or null during initialization
 */

export const useRegistry = () => pdfContext;
