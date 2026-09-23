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
import {
  refFromStableId,
  reload,
  type DocumentEvent,
  type Mirror,
  type PageRef,
} from '@embedpdf/core';
import {
  annotationKey,
  positionKey,
  type AnnotationDTO,
  type FormWidget,
} from '@embedpdf/engine-core/runtime';

import type { AnnotationContext } from '../services/context';
import type { AnnotationEvents } from '../services/events';

/** One confirmed annotation. */
export interface AnnotationRecord {
  readonly dto: AnnotationDTO;
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
 * `bump` is set. A weak record the engine just named (a direct-object
 * annotation that got an /NM when it was written) keeps its place under its
 * new key: its position (`dto.index`) is the key it had.
 */
function put(
  records: AnnotationRecords,
  dtos: readonly AnnotationDTO[],
  bump: boolean,
): AnnotationRecords {
  if (!dtos.length) return records;
  const byKey = { ...records.byKey };
  const added: string[] = [];
  const renamed = new Map<string, string>();
  for (const dto of dtos) {
    const key = annotationKey(dto.ref);
    const position = positionKey(dto.page, dto.index);
    const named = key !== position && !(key in byKey) && position in byKey;
    const previous = named ? byKey[position] : byKey[key];
    if (named) {
      delete byKey[position];
      renamed.set(position, key);
    } else if (!previous) {
      added.push(key);
    }
    byKey[key] = { dto, apVersion: (previous?.apVersion ?? 0) + (bump ? 1 : 0) };
  }
  const order = renamed.size ? records.order.map((key) => renamed.get(key) ?? key) : records.order;
  return { byKey, order: added.length ? [...order, ...added] : order };
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
  const wanted = new Set(pages.map((page) => page.pageObjectNumber));
  return records.order.filter((key) => wanted.has(records.byKey[key]!.dto.page.pageObjectNumber));
};

/**
 * A fresh read of the whole document. Every record's appearance version moves
 * past the one it had, so a reload after a desync re-fetches every raster
 * (the appearances may have changed while the event stream was not trusted).
 */
function fromSnapshot(
  current: AnnotationRecords,
  dtos: readonly AnnotationDTO[],
): AnnotationRecords {
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
  dtos: readonly AnnotationDTO[],
): AnnotationRecords {
  const read = new Set(dtos.map((dto) => annotationKey(dto.ref)));
  const stale = keysOnPages(records, pages).filter((key) => !read.has(key));
  return put(drop(records, stale), dtos, true);
}

const pagesOfWidgets = (widgets: readonly FormWidget[]): PageRef[] =>
  widgets.flatMap((widget) => (widget.page ? [widget.page] : []));

const widgetKeys = (widgets: readonly FormWidget[]): string[] =>
  widgets.flatMap((widget) => (widget.ref ? [annotationKey(widget.ref)] : []));

type AnnotationEvent = Extract<
  DocumentEvent,
  { type: 'annotation.created' | 'annotation.updated' | 'annotation.deleted' | 'annotation.moved' }
>;

const recordsOf = (event: AnnotationEvent): readonly AnnotationDTO[] => {
  switch (event.type) {
    case 'annotation.created':
      return [event.created];
    case 'annotation.updated':
      return [event.updated];
    case 'annotation.moved':
      return event.moved;
    case 'annotation.deleted':
      return [];
  }
};

/** Does this page hold a record addressed by its position? */
const hasWeakRecords = (records: AnnotationRecords, page: PageRef): boolean =>
  records.order.some((key) => {
    const { ref } = records.byKey[key]!.dto;
    return ref.kind === 'index' && ref.page.pageObjectNumber === page.pageObjectNumber;
  });

/**
 * Weak annotations (direct objects without /NM) are addressed by position, so
 * two kinds of annotation event need the page read again instead of applied:
 * one the engine says moved positions (`shouldRefetch`: a weak delete, a
 * move), and one that names a record this event does not carry and the
 * records do not hold (a reply whose weak parent the engine just named).
 * Pages without weak annotations never take this path.
 */
function positionsReload(
  records: AnnotationRecords,
  event: AnnotationEvent,
): ReturnType<typeof reload> | null {
  if (event.meta.shouldRefetch) return reload({ pages: [event.page] });
  const carried = new Set(recordsOf(event).map((dto) => annotationKey(dto.ref)));
  const unknown = event.meta.changed.some((id) => {
    const key = annotationKey(refFromStableId(event.page, id));
    return !carried.has(key) && !(key in records.byKey);
  });
  return unknown && hasWeakRecords(records, event.page) ? reload({ pages: [event.page] }) : null;
}

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
    case 'annotation.created':
      return positionsReload(records, event) ?? put(records, [event.created], true);
    case 'annotation.updated':
      return (
        positionsReload(records, event) ?? put(records, [event.updated], event.appearance.changed)
      );
    case 'annotation.moved':
      return positionsReload(records, event) ?? put(records, event.moved, false);
    case 'annotation.deleted':
      return (
        positionsReload(records, event) ??
        (event.deleted
          ? drop(records, [annotationKey(refFromStableId(event.page, event.deleted))])
          : records)
      );
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
    case 'form.repaired':
      return event.widgetsLinked > 0 || event.appearancesBaked > 0 ? reload() : records;
    case 'form.fieldCreated':
    case 'form.widgetAttached':
    case 'form.widgetDetached': {
      const pages = pagesOfWidgets(event.field.widgets);
      return pages.length ? reload({ pages }) : records;
    }
    case 'form.fieldDeleted':
      return drop(records, widgetKeys(event.removedWidgets));
    case 'form.effectsApplied': {
      // A script can change a widget's display flags.
      const pages = pagesOfWidgets(event.changedWidgets);
      return pages.length ? reload({ pages }) : records;
    }
    // The form plane and signatures repaint widgets without changing their records.
    case 'form.valueChanged':
      return bumpAppearance(records, widgetKeys(event.changedWidgets));
    case 'form.fieldUpdated':
      return bumpAppearance(records, widgetKeys(event.field.widgets));
    case 'form.imported':
      return event.widgetsChanged > 0
        ? bumpAppearance(
            records,
            widgetKeys(event.snapshot.fields.flatMap((field) => field.widgets)),
          )
        : records;
    case 'signature.completed':
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
      const snapshot = await doc.annotations.listRawAll();
      const dtos = snapshot.pages.flatMap((page) => page.annotations);
      return { value: fromSnapshot(records.get(), dtos), cursor: snapshot.auditHead ?? null };
    },
    fold: foldRecords,
    loadPages: async (doc, pages) => {
      const read = await Promise.all(
        pages.map(async (page) => (await doc.page(page).annotations.list()).annotations),
      );
      return (current) => withPages(current, pages, read.flat());
    },
    changed: (change) => events.recordsChanged.emit(change),
  });
  return records;
}
