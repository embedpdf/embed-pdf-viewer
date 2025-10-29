import { CoreState, DocumentState } from './initial-state';

/**
 * Get the active document state
 */
export const getActiveDocumentState = (state: CoreState): DocumentState | null => {
  if (!state.activeDocumentId) return null;
  return state.documents[state.activeDocumentId] ?? null;
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
