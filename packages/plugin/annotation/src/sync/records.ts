/**
 * The records: every annotation the engine confirmed, held in a mirror. It is
 * loaded whole once, kept current by folding confirmed events from every
 * origin, and re-reads a page only when an event describes it too coarsely (a
 * redaction, an inserted page). Form fields' widgets aren't annotation
 * records: they come with the form, and so do their events.
 *
 * Two pure functions change the records, side by side here:
 *
 *   foldRecords      what the engine confirmed: `records.get()`
 *   predictRecords   what this session asked for and the engine hasn't
 *                    answered yet, op by op: `records.view()` shows it on top
 *
 * What happens when a change is confirmed (render preferences, record
 * events) is in sync/confirmed.ts.
 */
import {
  reload,
  type DocumentEvent,
  type Mirror,
  type PageRef,
  type PredictedOp,
} from '@embedpdf/core';
import { annotationAfter, annotationOfNew } from '@embedpdf/core-annotation';
import {
  annotationKey,
  annotationPatchBetween,
  deletedWith,
  reorderedList,
  reorderPart,
  type Annotation,
  type AnnotationDraft,
  type AnnotationPatch,
  type AnnotationRef,
  type ChangeOp,
  type ListPosition,
} from '@embedpdf/engine-core/runtime';

import type { AnnotationContext } from '../services/context';
import type { AnnotationEvents } from '../services/events';

/** One confirmed annotation. */
export interface AnnotationRecord {
  readonly dto: Annotation;
  /**
   * Revision of the engine-baked appearance. It advances when the engine
   * reports new raster content (a re-bake, a reload), and
   * only then: the page's rasters are fetched again exactly when it changes.
   */
  readonly apVersion: number;
}

/** Every confirmed annotation of the document, by annotation key. */
export interface AnnotationRecords {
  readonly byKey: Readonly<Record<string, AnnotationRecord>>;
  /** Document order: pages as loaded with each page's `/Annots` order, then records confirmed later. */
  readonly order: readonly string[];
}

export const NO_RECORDS: AnnotationRecords = { byKey: {}, order: [] };

/* ── pure updates of the records ─────────────────────────────────────────── */

/**
 * Add or replace these records, advancing their appearance version when
 * `bump` is set. A record keeps its key for life (an annotation's ref is its
 * name for life), so a replaced record keeps its place.
 */
function put(
  records: AnnotationRecords,
  dtos: readonly Annotation[],
  bump: boolean,
): AnnotationRecords {
  if (!dtos.length) return records;
  const byKey = { ...records.byKey };
  const added: string[] = [];
  for (const dto of dtos) {
    const key = annotationKey(dto.ref);
    const previous = byKey[key];
    if (!previous) added.push(key);
    byKey[key] = { dto, apVersion: (previous?.apVersion ?? 0) + (bump ? 1 : 0) };
  }
  return { byKey, order: added.length ? [...records.order, ...added] : records.order };
}

function drop(records: AnnotationRecords, keys: readonly string[]): AnnotationRecords {
  const present = keys.filter((key) => key in records.byKey);
  if (!present.length) return records;
  const gone = new Set(present);
  const byKey = { ...records.byKey };
  for (const key of present) delete byKey[key];
  return { byKey, order: records.order.filter((key) => !gone.has(key)) };
}

const keysOnPages = (records: AnnotationRecords, pages: readonly PageRef[]): string[] => {
  const wanted = new Set(pages.map((page) => page.objectNumber));
  return records.order.filter((key) => wanted.has(records.byKey[key]!.dto.page.objectNumber));
};

/**
 * A fresh read of the whole document. Every record's appearance version moves
 * past the one it had, so a reload after a desync re-fetches every raster
 * (the appearances may have changed while the event stream was not trusted).
 */
function fromSnapshot(current: AnnotationRecords, dtos: readonly Annotation[]): AnnotationRecords {
  const byKey: Record<string, AnnotationRecord> = {};
  const order: string[] = [];
  for (const dto of dtos) {
    const key = annotationKey(dto.ref);
    const previous = current.byKey[key];
    if (!(key in byKey)) order.push(key);
    byKey[key] = { dto, apVersion: previous ? previous.apVersion + 1 : 0 };
  }
  return { byKey, order };
}

/** Some pages were read again: their records are replaced, and their rasters re-fetched. */
function withPages(
  records: AnnotationRecords,
  pages: readonly PageRef[],
  dtos: readonly Annotation[],
): AnnotationRecords {
  const read = new Set(dtos.map((dto) => annotationKey(dto.ref)));
  const stale = keysOnPages(records, pages).filter((key) => !read.has(key));
  return put(drop(records, stale), dtos, true);
}

/** Apply one confirmed document event to the records. Pure, and the same for every origin. */
export function foldRecords(
  records: AnnotationRecords,
  event: DocumentEvent,
): AnnotationRecords | ReturnType<typeof reload> {
  switch (event.type) {
    // A new record comes with a freshly baked appearance; the engine says
    // whether an update changed one.
    case 'annotations.created':
      return put(records, [event.annotation], true);
    case 'annotations.updated':
      return put(records, [event.annotation], event.appearance.changed);
    case 'annotations.reordered': {
      // The page's records take the new order in their slots.
      const page = event.page.objectNumber;
      return {
        ...records,
        order: reorderPart(
          records.order,
          (key) => records.byKey[key]?.dto.page.objectNumber === page,
          event.order.map(annotationKey),
          (key) => key,
        ),
      };
    }
    case 'annotations.deleted':
      return drop(records, event.deleted.map(annotationKey));
    // An undo brought deleted annotations back, each in the place it had:
    // the event doesn't say where, so the page is read again.
    case 'annotations.restored':
      return reload({ pages: [event.page] });
    case 'pages.deleted':
      return drop(records, keysOnPages(records, event.pages));
    case 'pages.inserted':
      return event.insertedPages.length ? reload({ pages: event.insertedPages }) : records;
    // These paint annotations into the page content and remove them.
    case 'redaction.applied':
    case 'pages.flattened': {
      const pages = event.results
        .filter((result) => result.status === 'applied')
        .map((result) => result.page);
      return pages.length ? reload({ pages }) : records;
    }
    case 'annotations.flattened':
      return event.results.some((result) => result.status === 'applied')
        ? reload({ pages: [event.page] })
        : records;
    default:
      return records;
  }
}

/* ── what this session asked for ─────────────────────────────────────────── */

/**
 * The annotation a create writes, as the engine reads it back. The
 * annotations it links to (the one it answers, the one a popup shows) are the
 * engine's to look up as it writes: it is read without them, then they are
 * stated. Throws for a draft the engine would refuse.
 */
export function annotationOfCreate(draft: AnnotationDraft, ref: AnnotationRef): Annotation {
  const { reply, parent, ...fields } = draft as AnnotationDraft & {
    reply?: { to: AnnotationRef; type?: 'reply' | 'group' } | null;
    parent?: AnnotationRef | null;
  };
  return {
    ...annotationOfNew(fields as AnnotationDraft, { ref }),
    ...(reply ? { reply: { to: reply.to, type: reply.type ?? 'reply' } } : {}),
    ...(parent ? { parent } : {}),
  } as Annotation;
}

/**
 * The record keys of one page in a new drawing order: `keys` moved to
 * `position` among the page's others, in the order given, as the engine
 * reorders. Other pages keep their places. Unchanged when the engine would
 * refuse it (a key or the neighbour no longer on the page).
 */
function reorderedKeys(
  records: AnnotationRecords,
  page: number,
  keys: readonly string[],
  position: ListPosition<string>,
): readonly string[] {
  const onPage = (key: string) => records.byKey[key]?.dto.page.objectNumber === page;
  try {
    const order = reorderedList(records.order.filter(onPage), keys, position, (key) => key);
    return reorderPart(records.order, onPage, order, (key) => key);
  } catch {
    return records.order;
  }
}

/** The page's annotations, in drawing order. */
const annotationsOn = (records: AnnotationRecords, page: number): Annotation[] =>
  records.order
    .map((key) => records.byKey[key]!.dto)
    .filter((dto) => dto.page.objectNumber === page);

/**
 * One op of this session's pending changes, applied to the records as the
 * engine will apply it; `records.view()` replays them, in staging order, over
 * what the engine confirmed. Pure and absolute: an op whose answer the
 * records hold already changes nothing, and so does an op the engine would
 * refuse (its annotation gone, a patch it no longer takes). A record it
 * changes keeps its appearance version: the engine's raster is the one it
 * had until the answer brings a new one.
 */
export function predictRecords(records: AnnotationRecords, op: PredictedOp): AnnotationRecords {
  switch (op.type) {
    case 'annotations.create': {
      // A create the engine names has no key to show it by until it answers.
      if (op.objectNumber === undefined) return records;
      const ref: AnnotationRef = {
        kind: 'objectNumber',
        page: op.page,
        objectNumber: op.objectNumber,
      };
      if (annotationKey(ref) in records.byKey) return records;
      try {
        return put(records, [annotationOfCreate(op.data, ref)], false);
      } catch {
        return records;
      }
    }
    case 'annotations.update': {
      const stored = records.byKey[annotationKey(op.ref)];
      if (!stored) return records;
      let dto: Annotation;
      try {
        dto = annotationAfter(stored.dto, op.patch);
      } catch {
        return records;
      }
      return put(records, [dto], false);
    }
    case 'annotations.delete': {
      // What goes with it goes too: its replies and grouped parts, their popups.
      const page = annotationsOn(records, op.ref.page.objectNumber);
      return drop(
        records,
        deletedWith(page, op.ref).map((annotation) => annotationKey(annotation.ref)),
      );
    }
    case 'annotations.reorder': {
      const order = reorderedKeys(
        records,
        op.page.objectNumber,
        op.refs.map(annotationKey),
        typeof op.position === 'object'
          ? 'before' in op.position
            ? { before: annotationKey(op.position.before) }
            : { after: annotationKey(op.position.after) }
          : op.position,
      );
      return order === records.order ? records : { ...records, order };
    }
    case 'annotations.restore': {
      const key = annotationKey(op.annotation.ref);
      if (key in records.byKey) return records;
      // Back in its place among the page's annotations.
      const page = op.annotation.page.objectNumber;
      const onPage = records.order.filter(
        (each) => records.byKey[each]!.dto.page.objectNumber === page,
      );
      const before = onPage[op.index];
      const at = before === undefined ? records.order.length : records.order.indexOf(before);
      return {
        byKey: { ...records.byKey, [key]: { dto: op.annotation, apVersion: 0 } },
        order: [...records.order.slice(0, at), key, ...records.order.slice(at)],
      };
    }
    default:
      return records;
  }
}

/** What undoing one op looks like, over the records it applies to. */
function undoOfOp(records: AnnotationRecords, op: ChangeOp): PredictedOp[] {
  switch (op.type) {
    case 'annotations.create':
      return op.objectNumber === undefined
        ? []
        : [
            {
              type: 'annotations.delete',
              ref: { kind: 'objectNumber', page: op.page, objectNumber: op.objectNumber },
            },
          ];
    case 'annotations.update': {
      const stored = records.byKey[annotationKey(op.ref)];
      if (!stored) return [];
      let after: Annotation;
      try {
        after = annotationAfter(stored.dto, op.patch);
      } catch {
        return [];
      }
      const patch = {
        ...annotationPatchBetween(after, stored.dto),
        subtype: stored.dto.subtype,
      } as AnnotationPatch;
      return [{ type: 'annotations.update', ref: op.ref, patch }];
    }
    case 'annotations.delete': {
      // Everything that went with it comes back, each in its place.
      const page = annotationsOn(records, op.ref.page.objectNumber);
      const gone = new Set(deletedWith(page, op.ref));
      return page.flatMap((annotation, index): PredictedOp[] =>
        gone.has(annotation) ? [{ type: 'annotations.restore', annotation, index }] : [],
      );
    }
    case 'annotations.reorder':
      // The page's whole order as it was.
      return [
        {
          type: 'annotations.reorder',
          page: op.page,
          refs: annotationsOn(records, op.page.objectNumber).map((annotation) => annotation.ref),
          position: 'start',
        },
      ];
    default:
      return [];
  }
}

/**
 * What undoing `ops` looks like, read off the records they apply to, each
 * over what the ones before it left: the ops that bring the records back,
 * the last op's first. It is drawing only: the engine undoes a change by
 * its own record of it.
 */
export function undoOf(records: AnnotationRecords, ops: readonly ChangeOp[]): PredictedOp[] {
  const undo: PredictedOp[][] = [];
  let current = records;
  for (const op of ops) {
    undo.push(undoOfOp(current, op));
    current = predictRecords(current, op);
  }
  return undo.reverse().flat();
}

/* ── the mirror ──────────────────────────────────────────────────────────── */

/**
 * The records mirror. Every change it applies is published on the internal
 * `recordsChanged` event, where sync/confirmed.ts reacts to it.
 */
export function createRecordsMirror(
  ctx: Pick<AnnotationContext, 'mirror' | 'doc'>,
  events: Pick<AnnotationEvents, 'recordsChanged'>,
): Mirror<AnnotationRecords> {
  const records: Mirror<AnnotationRecords> = ctx.mirror<AnnotationRecords>({
    name: 'records',
    initial: () => NO_RECORDS,
    // Without `doc.annotate.read` the bulk read would be refused: skip it
    // and report `forbidden`; a later refresh checks again.
    readable: () => ctx.doc?.security.allows('doc.annotate.read') ?? true,
    load: async (doc) => {
      const list = await doc.annotations.list();
      return {
        value: fromSnapshot(records.get(), list.annotations),
        cursor: list.auditHead ?? null,
      };
    },
    fold: foldRecords,
    predict: predictRecords,
    loadPages: async (doc, pages) => {
      const { annotations } = await doc.annotations.list({ pages });
      return (current) => withPages(current, pages, annotations);
    },
    changed: (change) => events.recordsChanged.emit(change),
  });
  return records;
}
