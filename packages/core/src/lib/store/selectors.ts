import { PdfPageObject, PdfPermissionFlag } from '@embedpdf/models';
import { CoreState, DocumentState } from './initial-state';
import { ALL_PERMISSION_FLAGS, getPermissionOverride } from '../types/permissions';

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

/**
 * Get a complete visual/export page order for a document.
 * Missing, duplicate, or stale entries are repaired against the current page count.
 */
export const getDocumentPageOrder = (documentState: DocumentState | null): number[] => {
  const pageCount = documentState?.document?.pageCount ?? 0;
  const incoming = documentState?.pageOrder ?? [];
  const seen = new Set<number>();
  const order: number[] = [];

  for (const pageIndex of incoming) {
    if (
      Number.isInteger(pageIndex) &&
      pageIndex >= 0 &&
      pageIndex < pageCount &&
      !seen.has(pageIndex)
    ) {
      seen.add(pageIndex);
      order.push(pageIndex);
    }
  }

  for (let pageIndex = 0; pageIndex < pageCount; pageIndex++) {
    if (!seen.has(pageIndex)) {
      order.push(pageIndex);
    }
  }

  return order;
};

/**
 * Get page objects in their current visual/export order.
 */
export const getOrderedPages = (documentState: DocumentState | null): PdfPageObject[] => {
  if (!documentState?.document) return [];

  const pagesBySourceIndex = new Map(
    documentState.document.pages.map((page) => [page.index, page] as const),
  );

  return getDocumentPageOrder(documentState)
    .map((pageIndex) => pagesBySourceIndex.get(pageIndex))
    .filter((page): page is PdfPageObject => Boolean(page));
};

/**
 * Whether the current visual/export order differs from the source PDF order.
 */
export const isPageOrderChanged = (documentState: DocumentState | null): boolean => {
  return getDocumentPageOrder(documentState).some(
    (pageIndex, visualIndex) => pageIndex !== visualIndex,
  );
};

// ─────────────────────────────────────────────────────────
// Permission Selectors
// ─────────────────────────────────────────────────────────

/**
 * Check if a specific permission flag is effectively allowed for a document.
 * Applies layered resolution: per-document override → global override → enforceDocumentPermissions → PDF permission.
 *
 * @param state - The core state
 * @param documentId - The document ID to check permissions for
 * @param flag - The permission flag to check
 * @returns true if the permission is allowed, false otherwise
 */
export function getEffectivePermission(
  state: CoreState,
  documentId: string,
  flag: PdfPermissionFlag,
): boolean {
  const docState = state.documents[documentId];
  const docConfig = docState?.permissions;
  const globalConfig = state.globalPermissions;
  const pdfPermissions = docState?.document?.permissions ?? PdfPermissionFlag.AllowAll;

  // 1. Per-document override wins (supports both numeric and string keys)
  const docOverride = getPermissionOverride(docConfig?.overrides, flag);
  if (docOverride !== undefined) {
    return docOverride;
  }

  // 2. Global override (supports both numeric and string keys)
  const globalOverride = getPermissionOverride(globalConfig?.overrides, flag);
  if (globalOverride !== undefined) {
    return globalOverride;
  }

  // 3. Check enforce setting (per-doc takes precedence over global)
  const enforce =
    docConfig?.enforceDocumentPermissions ?? globalConfig?.enforceDocumentPermissions ?? true;

  if (!enforce) return true; // Not enforcing = allow all

  // 4. Use PDF permission
  return (pdfPermissions & flag) !== 0;
}

/**
 * Get all effective permissions as a bitmask for a document.
 * Combines all individual permission checks into a single bitmask.
 *
 * @param state - The core state
 * @param documentId - The document ID to get permissions for
 * @returns A bitmask of all effective permissions
 */
export function getEffectivePermissions(state: CoreState, documentId: string): number {
  return ALL_PERMISSION_FLAGS.reduce((acc, flag) => {
    return getEffectivePermission(state, documentId, flag) ? acc | flag : acc;
  }, 0);
}
