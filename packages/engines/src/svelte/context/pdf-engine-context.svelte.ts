import { getContext, setContext } from 'svelte';
import type { PdfEngine } from '@embedpdf/models';

export interface PdfEngineContextState {
  engine: PdfEngine | null;
  isLoading: boolean;
  error: Error | null;
}

const PDF_ENGINE_CONTEXT_KEY = Symbol('pdfEngineContext');

/**
 * Set the PDF engine context (used by PdfEngineProvider)
 */
export function setPdfEngineContext(value: PdfEngineContextState) {
  setContext(PDF_ENGINE_CONTEXT_KEY, value);
}

/**
 * Get the PDF engine context
 * @throws Error if used outside of PdfEngineProvider
 */
export function getPdfEngineContext(): PdfEngineContextState {
  const context = getContext<PdfEngineContextState | undefined>(PDF_ENGINE_CONTEXT_KEY);

  if (context === undefined) {
    throw new Error('getPdfEngineContext must be used within a PdfEngineProvider');
  }

  return context;
}
