/**
 * The confirmed layer: every annotation record the engine confirmed, held in
 * a mirror. It is loaded whole once, kept current by folding confirmed events
 * from every origin, and re-reads a page only when an event describes it too
 * coarsely (a redaction, an inserted page, a new form field).
 *
 * Nothing unconfirmed ever enters it: the user's changes wait in the plugin
 * state's `pending` entries (model.ts) and the view lays them on top
 * (read/view.ts). What happens when a change is confirmed (new records find
 * their keys, record events fire) is in sync/confirmed.ts.
 */
import { reload, type DocumentEvent, type Mirror, type PageRef } from '@embedpdf/core';
import { annotationKey, type Annotation, type FormWidget } from '@embedpdf/engine-core/runtime';

import { moveInOrder } from '../model';
import type { AnnotationContext } from '../services/context';
import type { AnnotationEvents } from '../services/events';

/** One confirmed annotation. */
export interface AnnotationRecord {
  readonly dto: Annotation;
  /**
   * Revision of the engine-baked appearance. It advances when the engine
   * reports new raster content (a re-bake, a repainted widget, a reload), and
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

/** The engine repainted these records without changing them (a form value, a signature). */
function bumpAppearance(records: AnnotationRecords, keys: readonly string[]): AnnotationRecords {
  const present = keys.filter((key) => key in records.byKey);
  if (!present.length) return records;
  const byKey = { ...records.byKey };
  for (const key of present) byKey[key] = { ...byKey[key]!, apVersion: byKey[key]!.apVersion + 1 };
  return { ...records, byKey };
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

const pagesOfWidgets = (widgets: readonly FormWidget[]): PageRef[] =>
  widgets.flatMap((widget) => (widget.page ? [widget.page] : []));

const widgetKeys = (widgets: readonly FormWidget[]): string[] =>
  widgets.flatMap((widget) => (widget.ref ? [annotationKey(widget.ref)] : []));

/**
 * Apply one confirmed document event to the records. Pure, and the same for
 * every origin. Events that change widgets through the form plane re-read
 * the widgets' pages: the form result carries fields, not annotation records.
 */
export function foldRecords(
  records: AnnotationRecords,
  event: DocumentEvent,
): AnnotationRecords | ReturnType<typeof reload> {
  switch (event.type) {
    // A new record comes with a freshly baked appearance; the engine says
    // whether an update changed one; a z-order move changes none.
    case 'annotations.created':
      return put(records, [event.annotation], true);
    case 'annotations.updated':
      return put(records, [event.annotation], event.appearance.changed);
    case 'annotations.moved': {
      // The moved records, in their new order, from the first one's new index.
      const moved = put(records, event.annotations, false);
      const keys = event.annotations.map((annotation) => annotationKey(annotation.ref));
      const page = event.page.objectNumber;
      return {
        ...moved,
        order: moveInOrder(
          moved.order,
          (key) => moved.byKey[key]?.dto.page.objectNumber === page,
          keys,
          event.annotations[0]?.index ?? 0,
        ),
      };
    }
    case 'annotations.deleted':
      return drop(records, event.deleted.map(annotationKey));
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
    // A repair links stray widgets into fields and re-bakes appearances, and
    // its result names none of them.
    case 'forms.repaired':
      return event.widgetsLinked > 0 || event.appearancesBaked > 0 ? reload() : records;
    case 'forms.created':
    case 'forms.widgetAdded':
    case 'forms.widgetRemoved': {
      const pages = pagesOfWidgets(event.field.widgets);
      return pages.length ? reload({ pages }) : records;
    }
    case 'forms.deleted':
      return drop(records, widgetKeys(event.meta.changedWidgets));
    case 'forms.effectsApplied': {
      // A script can change a widget's display flags.
      const pages = pagesOfWidgets(event.meta.changedWidgets);
      return pages.length ? reload({ pages }) : records;
    }
    // The form plane and signatures repaint widgets without changing their records.
    case 'forms.valueSet':
      return bumpAppearance(records, widgetKeys(event.meta.changedWidgets));
    case 'forms.updated':
      return bumpAppearance(records, widgetKeys(event.field.widgets));
    case 'forms.imported':
      return event.applied > 0
        ? bumpAppearance(records, widgetKeys(event.form.fields.flatMap((field) => field.widgets)))
        : records;
    case 'signatures.completed':
      return event.signature.widget
        ? bumpAppearance(records, widgetKeys([event.signature.widget]))
        : records;
    default:
      return records;
  }
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
    loadPages: async (doc, pages) => {
      const { annotations } = await doc.annotations.list({ pages });
      return (current) => withPages(current, pages, annotations);
    },
    changed: (change) => events.recordsChanged.emit(change),
  });
  return records;
}
