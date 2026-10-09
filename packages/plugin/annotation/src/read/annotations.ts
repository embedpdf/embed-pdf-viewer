import { PluginError } from '@embedpdf/core';
import type { ModelAnnotation, Model } from '@embedpdf/core-annotation';
import {
  annotationKey,
  type Annotation,
  type AnnotationRef,
  type PageRef,
} from '@embedpdf/engine-core/runtime';

import type { AnnotationFilter } from '../contract';
import type { AnnotationContext, AnnotationServices } from '../services';

/**
 * The public reads: the engine's records as the user sees them. Each is the
 * annotation a record in the view holds (the engine's read, with this
 * session's pending changes applied as the engine will apply them), so a read
 * is reference-stable until its annotation changes, and a new annotation
 * reads before the engine confirms it.
 */
export function createAnnotationReads(
  ctx: Pick<AnnotationContext, 'getPage'>,
  { store, records }: Pick<AnnotationServices, 'store' | 'records'>,
) {
  const get = (ref: AnnotationRef): Annotation | null =>
    store.model().byId[annotationKey(ref)]?.annotation ?? null;

  /** Whether a change of this session to it waits for the engine: it shows other than the engine has it. */
  const isPending = (ref: AnnotationRef): boolean => {
    const key = annotationKey(ref);
    return records.view().byKey[key] !== records.get().byKey[key];
  };

  /**
   * The object numbers of the pages a filter names; `null` without a page
   * filter. A page that isn't in the document names none: its list is empty.
   */
  const pagesOf = (filter?: AnnotationFilter): ReadonlySet<number> | null => {
    if (!filter?.pages) return null;
    const numbers = new Set<number>();
    for (const page of filter.pages) {
      const info = ctx.getPage(page);
      if (info) numbers.add(info.ref.objectNumber);
    }
    return numbers;
  };

  const listAnnots = (filter?: AnnotationFilter): ModelAnnotation[] => {
    const model = store.model();
    const pages = pagesOf(filter);
    return model.order
      .map((id) => model.byId[id])
      .filter((record): record is ModelAnnotation => record !== undefined)
      .filter(
        (record) =>
          (!pages || pages.has(record.annotation.page.objectNumber)) &&
          (!filter?.subtype || record.annotation.subtype === filter.subtype),
      );
  };
  const annotationsOf = (records: readonly ModelAnnotation[]): Annotation[] =>
    records.map((record) => record.annotation);

  // Unfiltered and one-page lists are what layers subscribe to: memoized per model.
  let listMemo: { model: Model; v: readonly Annotation[] } | null = null;
  const pageListMemo = new Map<number, { model: Model; v: readonly Annotation[] }>();
  const list = (filter?: AnnotationFilter): readonly Annotation[] => {
    const model = store.model();
    if (!filter || (!filter.pages && filter.subtype === undefined)) {
      if (listMemo?.model !== model) listMemo = { model, v: annotationsOf(listAnnots()) };
      return listMemo.v;
    }
    const page = filter.pages?.length === 1 ? ctx.getPage(filter.pages[0]!) : null;
    if (page && filter.subtype === undefined) {
      const pageObjectNumber = page.ref.objectNumber;
      const hit = pageListMemo.get(pageObjectNumber);
      if (hit?.model === model) return hit.v;
      const pageList = annotationsOf(listAnnots(filter));
      pageListMemo.set(pageObjectNumber, { model, v: pageList });
      return pageList;
    }
    return annotationsOf(listAnnots(filter));
  };

  let selectedMemo: { model: Model; v: readonly Annotation[] } | null = null;
  const listSelected = (): readonly Annotation[] => {
    const model = store.model();
    if (selectedMemo?.model !== model) {
      selectedMemo = {
        model,
        v: annotationsOf(
          model.selected
            .map((id) => model.byId[id])
            .filter((record): record is ModelAnnotation => !!record),
        ),
      };
    }
    return selectedMemo.v;
  };

  /** The page a ref lives on: where the record was read, else the ref's own page. */
  const pageOf = (ref: AnnotationRef): PageRef =>
    store.model().byId[annotationKey(ref)]?.annotation.page ?? ref.page;

  const loadedOrThrow = (ref: AnnotationRef): ModelAnnotation => {
    const record = store.model().byId[annotationKey(ref)];
    if (!record) {
      throw new PluginError('not-found', 'annotation', 'annotation is not loaded in this document');
    }
    return record;
  };
  /** The records in the current selection. */
  const selectedRecords = (): ModelAnnotation[] => {
    const model = store.model();
    return model.selected
      .map((id) => model.byId[id])
      .filter((record): record is ModelAnnotation => !!record);
  };

  /** The annotation under the pointer, as the user sees it. */
  const getHovered = (): Annotation | null => {
    const model = store.model();
    return model.hovered ? (model.byId[model.hovered]?.annotation ?? null) : null;
  };

  /** The text box being typed in. */
  const getEditing = (): Annotation | null => {
    const model = store.model();
    return model.editing ? (model.byId[model.editing]?.annotation ?? null) : null;
  };

  const api = { get, list, isPending, getHovered };

  return {
    get,
    listAnnots,
    listSelected,
    getEditing,
    loadedOrThrow,
    selectedRecords,
    pageOf,
    api,
  };
}

export type AnnotationReads = ReturnType<typeof createAnnotationReads>;
