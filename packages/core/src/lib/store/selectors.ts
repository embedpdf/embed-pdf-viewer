import { CoreState, DocumentState } from './initial-state';
import { transformSize, PdfPageObjectWithRotatedSize } from '@embedpdf/models';

/**
 * Get pages with rotated size for a specific document
 */
export const getPagesWithRotatedSize = (
  documentState: DocumentState,
): PdfPageObjectWithRotatedSize[][] => {
  return documentState.pages.map((page) =>
    page.map((p) => ({
      ...p,
      rotatedSize: transformSize(p.size, documentState.rotation, 1),
    })),
  );
};

/**
 * Get the active document state
 */
export const getActiveDocumentState = (state: CoreState): DocumentState | null => {
  if (!state.activeDocumentId) return null;
  return state.documents[state.activeDocumentId] ?? null;
};

/**
 * Get pages with rotated size for the active document
 */
export const getActivePagesWithRotatedSize = (
  state: CoreState,
): PdfPageObjectWithRotatedSize[][] | null => {
  const activeDoc = getActiveDocumentState(state);
  if (!activeDoc) return null;
  return getPagesWithRotatedSize(activeDoc);
};

/**
 * Get document state by ID
 */
export const getDocumentState = (state: CoreState, documentId: string): DocumentState | null => {
  return state.documents[documentId] ?? null;
};

/**
 * Get all document IDs
 */
export const getDocumentIds = (state: CoreState): string[] => {
  return Object.keys(state.documents);
};

/**
 * Check if a document is loaded
 */
export const isDocumentLoaded = (state: CoreState, documentId: string): boolean => {
  return !!state.documents[documentId];
};

/**
 * Get the number of open documents
 */
export const getDocumentCount = (state: CoreState): number => {
  return Object.keys(state.documents).length;
};
