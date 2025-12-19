import { InjectionKey, Ref, ShallowRef } from 'vue';
import type { PluginRegistry, CoreState, DocumentState } from '@embedpdf/core';

export interface PDFContextState {
  registry: ShallowRef<PluginRegistry | null>;
  coreState: Ref<CoreState | null>;
  isInitializing: Ref<boolean>;
  pluginsReady: Ref<boolean>;

  // Convenience accessors (always safe to use)
  activeDocumentId: Ref<string | null>;
  activeDocument: Ref<DocumentState | null>;
  documents: Ref<Record<string, DocumentState>>;
  documentStates: Ref<DocumentState[]>;
}

export const pdfKey: InjectionKey<PDFContextState> = Symbol('pdfKey');
