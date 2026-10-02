/**
 * The documents in Vue: `useDocuments()` is the API (its calls use the
 * document in scope), `useDocument()` and `useDocumentsState()` what to show,
 * `usePageList()` the pages, and `useViewerSettings()` the `<Viewer>`'s own
 * settings.
 */
import { DocumentsToken, documentState, documentsState, shallowEqual } from '@embedpdf/core';
import type {
  DocumentsCapability,
  EventHook,
  PageInfo,
  ViewerSettings,
} from '@embedpdf/core';
import type { Ref } from 'vue';
import { stateComposable } from '../state';
import { useCapability, useCapabilityEvent } from './capabilities';
import { useDocumentId, useKernelValue } from './kernel';
import { fieldRefs } from './refs';
import type { FieldRefs } from './refs';

/**
 * The documents API: open, close, unlock, download, and the tabs. Inside a
 * `<DocumentScope>`, the calls that leave out the document use that one, so
 * `download()` without an id downloads the document in scope. The object never
 * changes, so it's safe to keep in a closure. What to show comes from
 * `useDocument()` and `useDocumentsState()`.
 */
export function useDocuments(): DocumentsCapability {
  return useCapability(DocumentsToken);
}

/**
 * The document this component talks to: the one its `<DocumentScope>` names,
 * or else the active one. Its `id`, `name`, `status`, `pageCount`,
 * `hasUnsavedChanges`, and why it's locked or failed, as refs. With no
 * document, an empty one that reads as still opening. With a selector, one ref
 * for the value it picks.
 */
export const useDocument = stateComposable(documentState);

/**
 * Every open document, in tab order (loading, locked and failed ones too), and
 * the active one's id, as refs. With a selector, one ref for the value it picks.
 */
export const useDocumentsState = stateComposable(documentsState);

/** Subscribe to one documents event while the component lives: `useDocumentsEvent((documents) => documents.onOpened, handler)`. */
export function useDocumentsEvent<Event>(
  select: (documents: DocumentsCapability) => EventHook<Event>,
  handler: (event: Event) => void,
): void {
  useCapabilityEvent(DocumentsToken, select, handler);
}

const NO_PAGES: readonly PageInfo[] = Object.freeze([]);

/**
 * The pages of the document this component talks to, in order: each with its
 * `ref`, `index`, `label`, size and rotation. Needs no Stage, so a thumbnail
 * list or a page picker works anywhere. The same array until a page is added,
 * removed, moved or rotated; empty with no document.
 */
export function usePageList(): Readonly<Ref<readonly PageInfo[]>> {
  const documentId = useDocumentId();
  return useKernelValue((kernel) =>
    documentId.value ? kernel.documents.listPages(documentId.value) : NO_PAGES,
  );
}

/**
 * The viewer's own settings (`<Viewer :identity :scope :accent :page>`), as
 * refs, or one ref for the value `select` picks: the accent every part without
 * a color of its own follows, and how pages look. What paints a page or an
 * accent reads it here, through `paint()` from `@embedpdf/web`, so a CSS
 * variable still wins.
 */
export function useViewerSettings(): FieldRefs<ViewerSettings>;
export function useViewerSettings<Selected>(
  select: (settings: ViewerSettings) => Selected,
): Readonly<Ref<Selected>>;
export function useViewerSettings<Selected>(select?: (settings: ViewerSettings) => Selected) {
  const value = useKernelValue((kernel) => {
    const settings = kernel.getSettings();
    return select ? select(settings) : settings;
  }, shallowEqual);
  return select ? value : fieldRefs(value as Readonly<Ref<ViewerSettings>>);
}
