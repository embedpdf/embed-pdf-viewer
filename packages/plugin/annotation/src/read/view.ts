/**
 * The view: what the user sees, as one pure function of the records and the
 * session.
 *
 *   records.get()   what the engine confirmed
 *   records.view()  that, with this session's pending changes on top (the
 *                   mirror replays them: `predictRecords`)
 *   →  AnnotationView, each record drawn as the change on it says
 *   AnnotationView  +  session  →  Model
 *
 * Every read and every gesture takes this `Model`. It is memoized, and each
 * record keeps its identity until its own inputs change, so a hover or a
 * change to one record does not recompute the others.
 */
import { memo, type Mirror } from '@embedpdf/core';
import {
  type AnnotationView,
  drawnAfter,
  fromDTO,
  type Id,
  type Model,
  type ModelAnnotation,
  sourceOfConfirmed,
  sourceOfNew,
} from '@embedpdf/core-annotation';
import {
  annotationPatchBetween,
  type Annotation,
  type AnnotationPatch,
} from '@embedpdf/engine-core/runtime';

import type { AnnotationContext } from '../services/context';
import type { AnnotationRecord, AnnotationRecords } from '../sync/records';

/**
 * This session's authority over a record (permissions.md): the same collab
 * mirrors the engine enforces with, asked about the record's stamped owner.
 * No security context (bare local engines, tests): unstamped, so allowed.
 */
export const authorityOf = (
  ctx: Pick<AnnotationContext, 'doc'>,
  dto: Annotation,
): ModelAnnotation['authority'] => {
  const security = ctx.doc?.security;
  if (!security) return undefined;
  const target = {
    ...(dto.userId != null ? { userId: dto.userId } : {}),
    ...(dto.groupId != null ? { groupId: dto.groupId } : {}),
  };
  return {
    update: security.allowsAnnotation('update', target),
    delete: security.allowsAnnotation('delete', target),
  };
};

export function createView(
  ctx: Pick<AnnotationContext, 'state' | 'doc' | 'document'>,
  records: Mirror<AnnotationRecords>,
) {
  /** A confirmed record as the model has it, cached per stored version and render preference. */
  const confirmed = new WeakMap<AnnotationRecord, { vector: boolean; record: ModelAnnotation }>();
  const confirmedRecord = (stored: AnnotationRecord, vector: boolean): ModelAnnotation => {
    const cached = confirmed.get(stored);
    if (cached && cached.vector === vector) return cached.record;
    const projected = fromDTO(stored.dto);
    const record: ModelAnnotation = {
      ...projected,
      source: sourceOfConfirmed(projected.annotation, vector),
      apVersion: stored.apVersion,
      authority: authorityOf(ctx, stored.dto),
    };
    confirmed.set(stored, { vector, record });
    return record;
  };

  /**
   * A record a pending change made or changed, cached per shown version, the
   * confirmed one it was made from and the render preference.
   */
  const predicted = new WeakMap<
    AnnotationRecord,
    { truth: AnnotationRecord | undefined; vector: boolean; record: ModelAnnotation }
  >();

  /**
   * How a record shows while a pending change is on it:
   *   - one this session creates: drawn as a new record is, with no raster
   *     from the engine yet;
   *   - a confirmed one: its predicted annotation, drawn as the change says
   *     (core `drawnAfter`, the engine's verdict on it): as before, its raster
   *     moved, or live. Its appearance version and authority stay the
   *     engine's.
   */
  const predictedRecord = (
    shown: AnnotationRecord,
    truth: AnnotationRecord | undefined,
    vector: boolean,
  ): ModelAnnotation => {
    const cached = predicted.get(shown);
    if (cached && cached.truth === truth && cached.vector === vector) return cached.record;
    let record: ModelAnnotation;
    if (!truth) {
      record = { ...fromDTO(shown.dto), unconfirmed: true, source: sourceOfNew(shown.dto) };
    } else {
      const base = confirmedRecord(truth, vector);
      const patch = {
        ...annotationPatchBetween(truth.dto, shown.dto),
        subtype: truth.dto.subtype,
      } as AnnotationPatch;
      record = { ...base, annotation: shown.dto, ...drawnAfter(base, patch) };
    }
    predicted.set(shown, { truth, vector, record });
    return record;
  };

  const view = memo(
    () => [records.get(), records.view(), ctx.state.get().vector, ctx.document()] as const,
    (truths, shown, vector): AnnotationView => {
      const byId: Record<Id, ModelAnnotation> = {};
      for (const key of shown.order) {
        const stored = shown.byKey[key]!;
        const truth = truths.byKey[key];
        byId[key] =
          stored === truth
            ? confirmedRecord(stored, key in vector)
            : predictedRecord(stored, truth, key in vector);
      }
      // The document's order, then the records this session created.
      return { byId, order: [...shown.order] };
    },
  );

  const model = memo(
    () => [ctx.state.get().session, view()] as const,
    (session, current): Model => ({ ...session, ...current }),
  );

  /** Each page's records in paint order, grouped once per model. */
  const recordsByPage = memo(
    () => [model()] as const,
    (whole) => {
      const pages = new Map<number, ModelAnnotation[]>();
      for (const id of whole.order) {
        const record = whole.byId[id]!;
        const list = pages.get(record.annotation.page.objectNumber);
        if (list) list.push(record);
        else pages.set(record.annotation.page.objectNumber, [record]);
      }
      return pages;
    },
  );

  const pageSlices = new Map<number, { whole: Model; parts: PageParts; model: Model }>();

  /**
   * One page's slice of the model: its records, and the selection, hover,
   * text editing, gesture and markup preview that concern it. It keeps its
   * identity while nothing on the page changed, so a page's reads recompute
   * only for changes on that page.
   */
  const pageModel = (pageObjectNumber: number): Model => {
    const whole = model();
    const cached = pageSlices.get(pageObjectNumber);
    if (cached?.whole === whole) return cached.model;
    const records = recordsByPage().get(pageObjectNumber) ?? NO_RECORDS;
    const onPage = (id: Id) => whole.byId[id]?.annotation.page.objectNumber === pageObjectNumber;
    const draft = whole.draft;
    const parts: PageParts = {
      records,
      selected: whole.selected.filter(onPage),
      hovered: whole.hovered !== null && onPage(whole.hovered) ? whole.hovered : null,
      editing: whole.editing !== null && onPage(whole.editing) ? whole.editing : null,
      draft:
        draft &&
        ('page' in draft
          ? draft.page.objectNumber === pageObjectNumber
          : 'ids' in draft
            ? draft.ids.some(onPage)
            : onPage(draft.id))
          ? draft
          : null,
      preview: whole.preview?.byPage[pageObjectNumber] ? whole.preview : null,
      settings: [whole.defaults, whole.hitMargin, whole.snap],
    };
    if (cached && samePageParts(cached.parts, parts)) {
      pageSlices.set(pageObjectNumber, { whole, parts: cached.parts, model: cached.model });
      return cached.model;
    }
    const slice: Model = {
      ...whole,
      byId: Object.fromEntries(records.map((record) => [record.id, record])),
      order: records.map((record) => record.id),
      selected: [...parts.selected],
      hovered: parts.hovered,
      editing: parts.editing,
      draft: parts.draft,
      preview: parts.preview,
    };
    pageSlices.set(pageObjectNumber, { whole, parts, model: slice });
    return slice;
  };

  return { view, model, pageModel };
}

const NO_RECORDS: readonly ModelAnnotation[] = [];

/** What one page's slice of the model is made of; compared item by item. */
interface PageParts {
  readonly records: readonly ModelAnnotation[];
  readonly selected: readonly Id[];
  readonly hovered: Id | null;
  readonly editing: Id | null;
  readonly draft: Model['draft'];
  readonly preview: Model['preview'];
  readonly settings: readonly unknown[];
}

const sameItems = (left: readonly unknown[], right: readonly unknown[]): boolean =>
  left.length === right.length && left.every((item, index) => Object.is(item, right[index]));

const samePageParts = (left: PageParts, right: PageParts): boolean =>
  sameItems(left.records, right.records) &&
  sameItems(left.selected, right.selected) &&
  left.hovered === right.hovered &&
  left.editing === right.editing &&
  left.draft === right.draft &&
  left.preview === right.preview &&
  sameItems(left.settings, right.settings);

export type View = ReturnType<typeof createView>;
