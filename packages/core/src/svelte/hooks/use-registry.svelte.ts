import type { PluginRegistry, CoreState, DocumentState } from '@embedpdf/core';
import { getContext, setContext } from 'svelte';

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

/**
 * Symbol.for, not Symbol: if a bundling mishap loads two copies of
 * @embedpdf/core, both copies still resolve the same context key.
 */
const PDF_CONTEXT_KEY = Symbol.for('@embedpdf/core:pdf-context');

/**
 * Creates a fresh reactive context. Each <EmbedPDF> owns one, so several
 * instances on the same page no longer overwrite each other's registry.
 */
export const createPdfContext = (): PDFContextState => {
  const context = $state<PDFContextState>({
    registry: null,
    coreState: null,
    isInitializing: true,
    pluginsReady: false,
    activeDocumentId: null,
    activeDocument: null,
    documents: {},
    documentStates: [],
  });

  return context;
};

/**
 * Publishes a context to everything rendered below the calling component.
 * Must run during component initialization.
 */
export const setPdfContext = (context: PDFContextState) => setContext(PDF_CONTEXT_KEY, context);

/**
 * What consumers outside an <EmbedPDF> receive: registry null, never
 * initialized. Frozen so stray writes fail loudly instead of appearing to
 * share state, which is the bug this module used to have.
 */
const fallbackContext: PDFContextState = Object.freeze({
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
 * @deprecated The context is scoped per <EmbedPDF> instance and resolved via
 * `useRegistry()`; this module-level object is no longer written to. It remains
 * only so existing imports keep resolving, and is now read-only.
 */
export const pdfContext = fallbackContext;

/**
 * Hook to access the PDF registry context.
 *
 * Must be called during component initialization, like any other Svelte
 * context consumer.
 *
 * @returns The context of the nearest <EmbedPDF> ancestor, or an inert
 * read-only fallback (registry `null`, forever) if there is no such ancestor.
 */
export const useRegistry = (): PDFContextState => {
  const context = getContext<PDFContextState | undefined>(PDF_CONTEXT_KEY);

  if (context) {
    return context;
  }

  // Warn on every resolution, deliberately: a module-level "warn once" flag
  // would be shared across SSR requests, silencing the warning for every
  // request after the first — the same cross-instance leak this file is
  // meant to fix.
  console.warn(
    '[@embedpdf/core] useRegistry() was called with no <EmbedPDF> ancestor. ' +
      'It will never resolve a registry, so plugins and capabilities stay in their ' +
      'loading state. Move the component inside <EmbedPDF>.',
  );

  return fallbackContext;
};
