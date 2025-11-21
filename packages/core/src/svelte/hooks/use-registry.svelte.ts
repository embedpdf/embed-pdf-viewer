import type { PluginRegistry, CoreState, DocumentState } from '@embedpdf/core';

export interface PDFContextState {
  registry: PluginRegistry | null;
  coreState: CoreState | null;
  isInitializing: boolean;
  pluginsReady: boolean;

  // Convenience accessors (always safe to use)
  activeDocumentId: string | null;
  activeDocument: DocumentState | null;
  documents: Record<string, DocumentState>;
  documentStates: DocumentState[];
}

export const pdfContext = $state<PDFContextState>({
  registry: null,
  coreState: null,
  isInitializing: true,
  pluginsReady: false,
  activeDocumentId: null,
  activeDocument: null,
  documents: {},
  documentStates: [],
});

/**
 * Hook to access the PDF registry context.
 * @returns The PDF registry or null during initialization
 */

export const useRegistry = () => pdfContext;
