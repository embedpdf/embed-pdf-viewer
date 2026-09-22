/**
 * The document's annotations, mirrored from the engine, and how they reach
 * the model.
 *
 * The `records` mirror holds every confirmed annotation record, keyed by
 * annotation key. It is loaded whole (one bulk read), kept current by folding
 * confirmed events from every origin, and re-reads only the pages an event
 * describes too coarsely (a redaction, an inserted page, a new form field).
 *
 * The model is the view: confirmed records plus the user's optimistic
 * changes plus session state. Every change of the mirror is absorbed into it
 * here. Origin decides only how a record renders, never what it contains:
 * another session's change renders from the engine's baked appearance, while
 * a change this session made keeps its current render source, so a record
 * the user just restyled keeps rendering live instead of waiting for a
 * raster. This is also the one place the created, updated, deleted and
 * resynced events fire.
 */
import {
  originOf,
  refFromStableId,
  reload,
  type DocumentEvent,
  type Mirror,
  type MirrorChange,
  type PageRef,
} from '@embedpdf/core';
import { capsFor, isSubstrateOnly, type ModelAnnotation } from '@embedpdf/core-annotation';
import { annotationKey, type FormWidget } from '@embedpdf/engine-core/runtime';

import type { AnnotationContext, AnnotationServices } from '../services';
import type { Announcer } from '../services/announce';
import type { EngineRecord, RenderSource } from '../services/records';

/** Confirmed annotation records by annotation key. */
export type RecordIndex = Readonly<Record<string, EngineRecord>>;

const keyOf = (record: EngineRecord): string => annotationKey(record.ref);

const withRecords = (index: RecordIndex, records: readonly EngineRecord[]): RecordIndex => {
  if (records.length === 0) return index;
  const next: Record<string, EngineRecord> = { ...index };
  for (const record of records) next[keyOf(record)] = record;
  return next;
};

const withoutKeys = (index: RecordIndex, keys: readonly string[]): RecordIndex => {
  const present = keys.filter((key) => key in index);
  if (present.length === 0) return index;
  const next: Record<string, EngineRecord> = { ...index };
  for (const key of present) delete next[key];
  return next;
};

const keysOnPages = (index: RecordIndex, pages: readonly PageRef[]): string[] => {
  const wanted = new Set(pages.map((page) => page.pageObjectNumber));
  return Object.keys(index).filter((key) => wanted.has(index[key]!.page.pageObjectNumber));
};

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
  index: RecordIndex,
  event: DocumentEvent,
): RecordIndex | ReturnType<typeof reload> {
  switch (event.type) {
    case 'annotation.created':
      return withRecords(index, [event.created]);
    case 'annotation.updated':
      return withRecords(index, [event.updated]);
    case 'annotation.moved':
      return withRecords(index, event.moved);
    case 'annotation.deleted':
      return event.deleted
        ? withoutKeys(index, [annotationKey(refFromStableId(event.page, event.deleted))])
        : index;
    case 'pages.deleted':
      return withoutKeys(index, keysOnPages(index, event.pages));
    case 'pages.inserted':
      return event.insertedPages.length ? reload({ pages: event.insertedPages }) : index;
    // These paint annotations into the page content and remove them.
    case 'redaction.applied':
    case 'pages.flattened': {
      const pages = event.results
        .filter((result) => result.status === 'applied')
        .map((result) => result.page);
      return pages.length ? reload({ pages }) : index;
    }
    case 'annotations.flattened':
      return event.results.some((result) => result.status === 'applied')
        ? reload({ pages: [event.page] })
        : index;
    // A repair links stray widgets into fields and re-bakes appearances, and
    // its result names none of them.
    case 'form.repaired':
      return event.widgetsLinked > 0 || event.appearancesBaked > 0 ? reload() : index;
    case 'form.fieldCreated':
    case 'form.widgetAttached':
    case 'form.widgetDetached': {
      const pages = pagesOfWidgets(event.field.widgets);
      return pages.length ? reload({ pages }) : index;
    }
    case 'form.fieldDeleted':
      return withoutKeys(index, widgetKeys(event.removedWidgets));
    case 'form.effectsApplied': {
      // A script can change a widget's display flags.
      const pages = pagesOfWidgets(event.changedWidgets);
      return pages.length ? reload({ pages }) : index;
    }
    default:
      return index;
  }
}

export function createRecordsMirror(
  ctx: Pick<AnnotationContext, 'mirror'>,
  {
    store,
    geometry,
    records,
    writes,
    authority,
    events,
  }: Pick<AnnotationServices, 'store' | 'geometry' | 'records' | 'writes' | 'authority' | 'events'>,
  announce: Announcer,
): Mirror<RecordIndex> {
  let loadedOnce = false;

  const ingest = (record: EngineRecord, source?: RenderSource): ModelAnnotation | null => {
    const crop = geometry.cropOf(record.page.pageObjectNumber);
    return crop ? records.ingest(record, crop, source) : null;
  };

  /** How a confirmed record renders; see the module comment. */
  const sourceFor = (
    event: DocumentEvent | null,
    record: EngineRecord,
    currentId: string,
  ): RenderSource => {
    if (!event || !('origin' in event) || event.origin.kind === 'remote') return 'baked';
    const current = store.model().byId[currentId];
    if (current) return current.source === 'vector' ? 'vector' : 'baked';
    return capsFor(record.subtype).opaqueBody ? 'baked' : 'vector';
  };

  /** Upsert confirmed records; `bumpAp` re-fetches baked rasters whose appearance changed. */
  const upsert = (
    event: DocumentEvent | null,
    changed: readonly EngineRecord[],
    bumpAp: boolean,
  ): void => {
    const bumped: ModelAnnotation[] = [];
    const kept: ModelAnnotation[] = [];
    for (const record of changed) {
      const annotation = ingest(record, sourceFor(event, record, keyOf(record)));
      if (!annotation) continue;
      // Conversation annotations (replies, review states) and attached link
      // children never paint, so they never cost a raster fetch.
      (bumpAp && !isSubstrateOnly(annotation) ? bumped : kept).push(annotation);
    }
    if (bumped.length) store.commit({ type: 'upsert', annots: bumped, bumpAp: true });
    if (kept.length) store.commit({ type: 'upsert', annots: kept });
  };

  const diff = (previous: RecordIndex, next: RecordIndex) => ({
    removed: Object.keys(previous).filter((key) => !(key in next)),
    changed: Object.keys(next)
      .filter((key) => next[key] !== previous[key])
      .map((key) => next[key]!),
  });

  /** A whole-document load: the snapshot is the confirmed truth. */
  const absorbLoad = (next: RecordIndex): void => {
    const annots = Object.values(next)
      .map((record) => ingest(record))
      .filter((annotation): annotation is ModelAnnotation => annotation !== null);
    // A reload after the first load re-fetches every baked raster: the
    // appearances may have changed while the event stream could not be trusted.
    store.commit({ type: 'hydrated', annots, bumpAp: loadedOnce });
    loadedOnce = true;
    events.resynced.emit({ pages: 'all' });
  };

  /** Some pages were re-read: replace their records, re-fetching their rasters. */
  const absorbPages = (
    pages: readonly PageRef[],
    previous: RecordIndex,
    next: RecordIndex,
  ): void => {
    const { removed } = diff(previous, next);
    if (removed.length) store.commit({ type: 'remove', ids: removed });
    upsert(
      null,
      keysOnPages(next, pages).map((key) => next[key]!),
      true,
    );
    events.resynced.emit({ pages });
  };

  /**
   * While a record is being text-edited, or a text write for it is in
   * flight, the text on screen is newer than this session's own echo of an
   * earlier write: the edit shadows the confirmed record until it ends.
   */
  const shadowedByTyping = (
    event: Extract<DocumentEvent, { type: 'annotation.updated' }>,
  ): boolean => {
    if (event.origin.kind !== 'local') return false;
    const key = keyOf(event.updated);
    return store.model().editing === key || writes.hasTextWrite(key);
  };

  const absorbEvent = (event: DocumentEvent, previous: RecordIndex, next: RecordIndex): void => {
    const { removed, changed } = diff(previous, next);
    if (event.type === 'annotation.updated' && shadowedByTyping(event)) {
      announce.updated(event.updated, originOf(event));
      return;
    }
    if (event.type === 'annotation.created') {
      // This session's optimistic create, matched by the /NM it sent: rename
      // the temporary record first, so selection and editing follow it.
      const created = event.created;
      const tempId = created.nm ? writes.claimCreate(created.nm) : undefined;
      if (tempId !== undefined && store.model().byId[tempId]) {
        store.commit({ type: 'created', tempId, id: keyOf(created), ref: created.ref });
      }
    }
    // The engine reports whether an update changed the appearance: a
    // preserved move costs no re-fetch, a regenerated appearance re-fetches
    // once. A create brings a freshly baked appearance; a z-order move none.
    const bumpAp =
      event.type === 'annotation.updated'
        ? event.appearance.changed
        : event.type !== 'annotation.moved';
    upsert(event, changed, bumpAp);
    if (removed.length) store.commit({ type: 'remove', ids: removed });

    if (!('origin' in event)) return;
    const origin = originOf(event);
    if (event.type === 'annotation.created') announce.created(event.created, origin);
    else if (event.type === 'annotation.updated') announce.updated(event.updated, origin);
    else if (event.type === 'annotation.deleted' && event.deleted) {
      const ref = refFromStableId(event.page, event.deleted);
      announce.deleted(ref, event.page, origin);
    }
  };

  return ctx.mirror<RecordIndex>({
    name: 'records',
    initial: () => ({}),
    // Without `doc.annotate.read` the bulk read would be refused: skip it
    // and report `forbidden`; a later refresh checks again.
    readable: () => authority.canRead(),
    load: async (doc) => {
      const snapshot = await doc.annotations.listRawAll();
      const all = snapshot.pages.flatMap((page) => page.annotations);
      return { value: withRecords({}, all), cursor: snapshot.auditHead ?? null };
    },
    fold: foldRecords,
    loadPages: async (doc, pages) => {
      const read = await Promise.all(
        pages.map(async (page) => (await doc.page(page).annotations.list()).annotations),
      );
      return (index) => withRecords(withoutKeys(index, keysOnPages(index, pages)), read.flat());
    },
    changed: (change: MirrorChange<RecordIndex>) => {
      if (change.cause === 'load') {
        if (change.pages === 'all') absorbLoad(change.next);
        else if (change.pages) absorbPages(change.pages, change.previous, change.next);
        return;
      }
      if (change.event) absorbEvent(change.event, change.previous, change.next);
    },
  });
}

/**
 * Widget appearances repainted by the form plane (a value write, an import,
 * a script batch, a signature's visual fill or seal) change pixels without
 * changing any annotation record: bump the widgets' appearance versions so
 * their rasters re-fetch.
 */
export function widgetsRepaintedBy(event: DocumentEvent): string[] {
  switch (event.type) {
    case 'form.valueChanged':
    case 'form.effectsApplied':
      return widgetKeys(event.changedWidgets);
    case 'form.fieldUpdated':
      return widgetKeys(event.field.widgets);
    case 'form.imported':
      return event.widgetsChanged > 0
        ? widgetKeys(event.snapshot.fields.flatMap((field) => field.widgets))
        : [];
    case 'signature.completed':
      return event.signature.widget ? widgetKeys([event.signature.widget]) : [];
    default:
      return [];
  }
}
