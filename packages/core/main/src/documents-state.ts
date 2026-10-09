/**
 * The documents' State tables as code: the document a component talks to (React's
 * `useDocument()`), and every open document with the active one (`useDocumentsState()`). Each
 * adapter turns these into its own reactive form, as it does a plugin's.
 */
import { defineState } from './state';
import { DocumentsToken, type DocumentInfo } from './types';

/** No document: none is open, or none is in scope. It reads as one still on its way. */
const NO_DOCUMENT: DocumentInfo = Object.freeze({
  id: '',
  name: undefined,
  status: 'loading',
  pageCount: 0,
  hasUnsavedChanges: false,
  passwordProvided: undefined,
  error: undefined,
});

/**
 * The document in scope (the capability resolved for a document, or else the active one): its
 * id, name, status, page count, unsaved changes, and why it's locked or failed.
 */
export const documentState = defineState(DocumentsToken, {
  read: (documents): DocumentInfo => documents.get() ?? NO_DOCUMENT,
  empty: NO_DOCUMENT,
});

/** Every open document, in tab order, and the active one's id. */
export interface DocumentsState {
  /** Every open document, loading, locked and failed ones included. */
  readonly documents: readonly DocumentInfo[];
  /** The active document's id, or null with none open. */
  readonly activeId: string | null;
}

export const documentsState = defineState(DocumentsToken, {
  read: (documents): DocumentsState => ({
    documents: documents.list(),
    activeId: documents.getActiveId(),
  }),
  empty: { documents: [], activeId: null },
});
