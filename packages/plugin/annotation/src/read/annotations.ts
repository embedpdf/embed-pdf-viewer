import { PluginError, memo, pageRefsEqual } from '@embedpdf/core';
import type { ModelAnnotation, Model } from '@embedpdf/core-annotation';
import {
  annotationKey,
  type AnnotationDTO,
  type AnnotationRef,
  type PageRef,
} from '@embedpdf/engine-core/runtime';

import type { AnnotationFilter } from '../contract';
import type { AnnotationContext, AnnotationServices } from '../services';
import { recordOfRef } from '../services/store';

/**
 * The public reads: the engine's records as the user sees them. Each is the
 * annotation a record in the view holds (the engine's read, with this
 * session's pending changes applied as the engine will apply them), so a read
 * is reference-stable until its annotation changes, and a new annotation
 * reads before the engine confirms it.
 */
export function createAnnotationReads(
  ctx: Pick<AnnotationContext, 'state'>,
  { store }: Pick<AnnotationServices, 'store'>,
) {
  /** The records with a change waiting for the engine. */
  const pendingIds = memo(
    () => [ctx.state.get().pending] as const,
    (pending) => new Set(pending.map((change) => change.id)),
  );

  const get = (ref: AnnotationRef): AnnotationDTO | null =>
    recordOfRef(store.model(), ref)?.annotation ?? null;

  const isPending = (ref: AnnotationRef): boolean => {
    const record = recordOfRef(store.model(), ref);
    return !!record && pendingIds().has(record.id);
  };

  const listAnnots = (filter?: AnnotationFilter): ModelAnnotation[] => {
    const model = store.model();
    const group = filter?.group ? annotationKey(filter.group) : undefined;
    return model.order
      .map((id) => model.byId[id])
      .filter((record): record is ModelAnnotation => record !== undefined)
      .filter(
        (record) =>
          (!filter?.page || pageRefsEqual(record.page, filter.page)) &&
          (!filter?.subtype || record.annotation.subtype === filter.subtype) &&
          (filter?.author === undefined || record.annotation.author === filter.author) &&
          (!group || record.group === group || record.id === group),
      );
  };
  const annotationsOf = (records: readonly ModelAnnotation[]): AnnotationDTO[] =>
    records.map((record) => record.annotation);

  // Unfiltered and per-page lists are what layers subscribe to: memoized per model.
  let listMemo: { model: Model; v: readonly AnnotationDTO[] } | null = null;
  const pageListMemo = new Map<number, { model: Model; v: readonly AnnotationDTO[] }>();
  const list = (filter?: AnnotationFilter): readonly AnnotationDTO[] => {
    const model = store.model();
    if (!filter) {
      if (listMemo?.model !== model) listMemo = { model, v: annotationsOf(listAnnots()) };
      return listMemo.v;
    }
    if (
      filter.page &&
      filter.subtype === undefined &&
      filter.author === undefined &&
      !filter.group
    ) {
      const pageObjectNumber = filter.page.pageObjectNumber;
      const hit = pageListMemo.get(pageObjectNumber);
      if (hit?.model === model) return hit.v;
      const pageList = annotationsOf(listAnnots(filter));
      pageListMemo.set(pageObjectNumber, { model, v: pageList });
      return pageList;
    }
    return annotationsOf(listAnnots(filter));
  };

  let selectedMemo: { model: Model; v: readonly AnnotationDTO[] } | null = null;
  const listSelected = (): readonly AnnotationDTO[] => {
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
    store.model().byId[annotationKey(ref)]?.page ?? ref.page;

  const loadedOrThrow = (ref: AnnotationRef): ModelAnnotation & { ref: AnnotationRef } => {
    const annotation = store.model().byId[annotationKey(ref)];
    if (!annotation || !annotation.ref) {
      throw new PluginError('not-found', 'annotation', 'annotation is not loaded in this document');
    }
    return annotation as ModelAnnotation & { ref: AnnotationRef };
  };
  /** Committed, data-backed annotations in the current selection. */
  const selectedCommitted = (): ModelAnnotation[] => {
    const model = store.model();
    return model.selected
      .map((id) => model.byId[id])
      .filter((annotation): annotation is ModelAnnotation => !!annotation && !!annotation.ref);
  };

  const api = {
    get,
    list,
    isPending,
    listSelected,
    getSelection: (): AnnotationRef[] => {
      const model = store.model();
      return model.selected
        .map((id) => model.byId[id]?.ref)
        .filter((ref): ref is AnnotationRef => ref != null);
    },
  };

  return { get, listAnnots, loadedOrThrow, selectedCommitted, pageOf, api };
}

export type AnnotationReads = ReturnType<typeof createAnnotationReads>;
