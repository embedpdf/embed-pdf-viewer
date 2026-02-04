import { createContext } from '@framework';
import type { CoreState, DocumentState, PluginRegistry } from '@embedpdf/core';

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

export const PDFContext = createContext<PDFContextState>({
  registry: null,
  coreState: null,
  isInitializing: true,
  pluginsReady: false,
  activeDocumentId: null,
  activeDocument: null,
  documents: {},
  documentStates: [],
});
