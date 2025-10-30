import { RedactionState, RedactionDocumentState } from './types';

export const getPendingRedactionsCount = (s: RedactionDocumentState) => s.pendingCount;

export const hasPendingRedactions = (s: RedactionDocumentState) => s.pendingCount > 0;

export const getDocumentPendingCount = (state: RedactionState, documentId: string): number => {
  return state.documents[documentId]?.pendingCount ?? 0;
};

export const getTotalPendingCount = (state: RedactionState): number => {
  return Object.values(state.documents).reduce((sum, doc) => sum + doc.pendingCount, 0);
};
