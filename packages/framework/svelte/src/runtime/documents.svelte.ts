/**
 * The documents and the viewer's own settings, for components: the documents API, the document
 * in scope, every open document, its pages, and the settings `<Viewer>` takes as props.
 */
import { DocumentsToken, documentState, documentsState, shallowEqual } from '@embedpdf/core';
import type {
  DocumentInfo,
  DocumentsCapability,
  DocumentsState,
  EventHook,
  PageInfo,
  ViewerSettings,
} from '@embedpdf/core';
import { useKernelBinding } from './binding.svelte';
import { useCapability, useCapabilityEvent, useDocumentId, useKernelValue } from './readers.svelte';
import { declaredState, readRecord } from './state.svelte';
import { derivedValue, type CurrentValue } from './values.svelte';

/**
 * The documents API: open, close, unlock, download, and the tabs. Inside a `<DocumentScope>`, the
 * calls that leave out the document use that one, so `download()` without an id downloads the
 * document in scope. What to show comes from `useDocument()` and `useDocumentsState()`.
 */
export function useDocuments(): DocumentsCapability {
  return useCapability(DocumentsToken);
}

/**
 * The document this component talks to: the one its `<DocumentScope>` names, or else the active
 * one. Its `id`, `name`, `status`, `pageCount`, `hasUnsavedChanges`, and why it's locked or
 * failed. With no document, an empty one that reads as still opening.
 */
export function useDocument(): Readonly<DocumentInfo>;
export function useDocument<Selected>(
  select: (document: DocumentInfo) => Selected,
): CurrentValue<Selected>;
export function useDocument<Selected>(select?: (document: DocumentInfo) => Selected) {
  const binding = useKernelBinding();
  const whole = declaredState(binding, DocumentsToken, documentState.read, documentState.empty);
  return readRecord(whole, Object.keys(documentState.empty) as (keyof DocumentInfo)[], select);
}

/** Every open document, in tab order (loading, locked and failed ones too), and the active one's id. */
export function useDocumentsState(): Readonly<DocumentsState>;
export function useDocumentsState<Selected>(
  select: (state: DocumentsState) => Selected,
): CurrentValue<Selected>;
export function useDocumentsState<Selected>(select?: (state: DocumentsState) => Selected) {
  const binding = useKernelBinding();
  const whole = declaredState(binding, DocumentsToken, documentsState.read, documentsState.empty);
  return readRecord(whole, Object.keys(documentsState.empty) as (keyof DocumentsState)[], select);
}

/** Subscribe to one documents event while the component lives: `useDocumentsEvent((documents) => documents.onOpened, handler)`. */
export function useDocumentsEvent<T>(
  select: (documents: DocumentsCapability) => EventHook<T>,
  handler: (event: T) => void,
): void {
  useCapabilityEvent(DocumentsToken, select, handler);
}

const NO_PAGES: readonly PageInfo[] = Object.freeze([]);

/**
 * The pages of the document this component talks to, in order: each with its `ref`, `index`,
 * `label`, size and rotation. Needs no Stage. The same array until a page is added, removed,
 * moved or rotated; empty with no document.
 */
export function usePageList(): CurrentValue<readonly PageInfo[]> {
  const documentId = useDocumentId();
  return useKernelValue((kernel) =>
    documentId.current ? kernel.documents.listPages(documentId.current) : NO_PAGES,
  );
}

/**
 * The viewer's own settings (`<Viewer identity scope accent page>`), or the value `select` picks
 * from them: the accent every part without a color of its own follows, and how pages look. What
 * paints a page or an accent reads it here, through `paint()` from `@embedpdf/web`, so a CSS
 * variable still wins.
 */
export function useViewerSettings(): Readonly<ViewerSettings>;
export function useViewerSettings<Selected>(
  select: (settings: ViewerSettings) => Selected,
): CurrentValue<Selected>;
export function useViewerSettings<Selected>(select?: (settings: ViewerSettings) => Selected) {
  const binding = useKernelBinding();
  const whole = derivedValue(() => {
    binding.track();
    return binding.kernel.getSettings();
  }, shallowEqual);
  return readRecord(whole, ['identity', 'scope', 'accent', 'page'], select);
}
