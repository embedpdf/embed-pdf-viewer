import { CoreState } from './initial-state';

/**
 * Calculate the next active document when closing a document.
 * Returns the document to activate, or null if no documents remain.
 */
export function calculateNextActiveDocument(
  state: CoreState,
  closingDocumentId: string,
  explicitNext?: string | null,
): string | null {
  const currentActiveId = state.activeDocumentId;

  // Only calculate if we're closing the active document
  if (currentActiveId !== closingDocumentId) {
    return currentActiveId;
  }

  // If explicit next was provided, validate and use it
  if (explicitNext !== undefined) {
    // Validate that the document exists
    return explicitNext && state.documents[explicitNext] ? explicitNext : null;
  }

  // Auto-calculate: Try left, then right, then null
  const closingIndex = state.documentOrder.indexOf(closingDocumentId);

  if (closingIndex === -1) {
    // Document not in order (shouldn't happen)
    return null;
  }

  // Try left first
  if (closingIndex > 0) {
    return state.documentOrder[closingIndex - 1];
  }

  // Try right
  if (closingIndex < state.documentOrder.length - 1) {
    return state.documentOrder[closingIndex + 1];
  }

  // No other documents
  return null;
}

/**
 * Reorder a document within the documentOrder array.
 * Returns the new order, or null if the operation is invalid.
 */
export function moveDocumentInOrder(
  currentOrder: string[],
  documentId: string,
  toIndex: number,
): string[] | null {
  const fromIndex = currentOrder.indexOf(documentId);

  // Validation
  if (fromIndex === -1) return null;
  if (toIndex < 0 || toIndex >= currentOrder.length) return null;
  if (fromIndex === toIndex) return null;

  // Calculate new order
  const newOrder = [...currentOrder];
  newOrder.splice(fromIndex, 1);
  newOrder.splice(toIndex, 0, documentId);

  return newOrder;
}
