/**
 * The view: what the user sees, as one pure function of the three layers.
 *
 *   records (confirmed)  +  pending (unconfirmed changes)  →  AnnotationView
 *   AnnotationView       +  session                        →  Model
 *
 * Every read and every gesture takes this `Model`. It is memoized, and each
 * record keeps its identity until its own inputs change, so a hover or a
 * change to one record does not recompute the others.
 */
import { memo, type Mirror } from '@embedpdf/core';
import {
  capsFor,
  type AnnotationView,
  type Id,
  type Model,
  type ModelAnnotation,
} from '@embedpdf/core-annotation';
import type { AnnotationDTO, PdfRect } from '@embedpdf/engine-core/runtime';

import type { PendingChange } from '../model';
import { fromDTO } from '../repository';
import type { AnnotationContext } from '../services/context';
import type { CropLookup } from '../services/geometry';
import type { AnnotationRecord, AnnotationRecords } from '../sync/records';

/**
 * This session's authority over a record (permissions.md): the same collab
 * mirrors the engine enforces with, asked about the record's stamped owner.
 * No security context (bare local engines, tests): unstamped, so allowed.
 */
export const authorityOf = (
  ctx: Pick<AnnotationContext, 'doc'>,
  dto: AnnotationDTO,
): ModelAnnotation['authority'] => {
  const security = ctx.doc?.security;
  if (!security) return undefined;
  const target = {
    ...(dto.userId != null ? { userId: dto.userId } : {}),
    ...(dto.groupId != null ? { groupId: dto.groupId } : {}),
  };
  return {
    update: security.allowsAnnotationMutation('update', target),
    delete: security.allowsAnnotationMutation('delete', target),
  };
};

const NO_CHANGES: readonly PendingChange[] = [];

export function createView(
  ctx: Pick<AnnotationContext, 'state' | 'doc' | 'document'>,
  records: Mirror<AnnotationRecords>,
  geometry: Pick<CropLookup, 'cropOf'>,
) {
  /** A confirmed record in content space, cached per record version, page box and render preference. */
  const confirmed = new WeakMap<
    AnnotationRecord,
    { crop: PdfRect; vector: boolean; annotation: ModelAnnotation }
  >();
  const confirmedAnnotation = (
    record: AnnotationRecord,
    vector: boolean,
  ): ModelAnnotation | null => {
    const crop = geometry.cropOf(record.dto.page.pageObjectNumber);
    if (!crop) return null;
    const cached = confirmed.get(record);
    if (cached && cached.crop === crop && cached.vector === vector) return cached.annotation;
    const projected = fromDTO(record.dto, crop);
    // Opaque bodies (stamp images, widgets) have no live rendering: always the raster.
    const live = vector && !capsFor(projected.subtype).opaqueBody;
    const annotation: ModelAnnotation = {
      ...projected,
      source: live ? 'vector' : 'baked',
      apVersion: record.apVersion,
      authority: authorityOf(ctx, record.dto),
    };
    confirmed.set(record, { crop, vector, annotation });
    return annotation;
  };

  /**
   * A record with its pending changes applied, oldest first. Over a confirmed
   * record it keeps the confirmed appearance version and authority: those
   * are the engine's, and may have moved on since the changes were made.
   * Cached per record while its base and changes stay the same.
   */
  const layered = new Map<
    Id,
    { base: ModelAnnotation; changes: readonly PendingChange[]; annotation: ModelAnnotation }
  >();
  const withChanges = (
    id: Id,
    base: ModelAnnotation,
    changes: readonly PendingChange[],
    confirmed: boolean,
  ): ModelAnnotation => {
    const cached = layered.get(id);
    if (
      cached &&
      cached.base === base &&
      cached.changes.length === changes.length &&
      cached.changes.every((change, index) => change === changes[index])
    ) {
      return cached.annotation;
    }
    let annotation = base;
    for (const { change } of changes) {
      if (change.kind === 'edit') annotation = { ...annotation, ...change.fields };
    }
    if (confirmed) {
      annotation = { ...annotation, apVersion: base.apVersion, authority: base.authority };
    }
    layered.set(id, { base, changes, annotation });
    return annotation;
  };

  const view = memo(
    () => [records.get(), ctx.state.get().pending, ctx.state.get().vector, ctx.document()] as const,
    (confirmedRecords, pending, vector): AnnotationView => {
      const changesOf = new Map<Id, PendingChange[]>();
      for (const change of pending) {
        const list = changesOf.get(change.id);
        if (list) list.push(change);
        else changesOf.set(change.id, [change]);
      }
      const deleted = (changes: readonly PendingChange[]) =>
        changes.some(({ change }) => change.kind === 'delete');

      const byId: Record<Id, ModelAnnotation> = {};
      const order: Id[] = [];
      for (const key of confirmedRecords.order) {
        const changes = changesOf.get(key) ?? NO_CHANGES;
        if (deleted(changes)) continue;
        const base = confirmedAnnotation(confirmedRecords.byKey[key]!, key in vector);
        if (!base) continue;
        byId[key] = changes.length ? withChanges(key, base, changes, true) : base;
        order.push(key);
      }
      // Records created in this session that the engine has not confirmed
      // yet. Changes to any other record show only while the engine still has
      // it: an edit never brings back a record deleted elsewhere.
      for (const [id, changes] of changesOf) {
        const created = changes.find(({ change }) => change.kind === 'create');
        if (!created || created.change.kind !== 'create' || id in byId || deleted(changes)) {
          continue;
        }
        byId[id] = withChanges(id, created.change.record, changes, false);
        order.push(id);
      }
      for (const id of layered.keys()) if (!(id in byId)) layered.delete(id);
      return { byId, order };
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
        const list = pages.get(record.page.pageObjectNumber);
        if (list) list.push(record);
        else pages.set(record.page.pageObjectNumber, [record]);
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
    const onPage = (id: Id) => whole.byId[id]?.page.pageObjectNumber === pageObjectNumber;
    const draft = whole.draft;
    const parts: PageParts = {
      records,
      selected: whole.selected.filter(onPage),
      hovered: whole.hovered !== null && onPage(whole.hovered) ? whole.hovered : null,
      editing: whole.editing !== null && onPage(whole.editing) ? whole.editing : null,
      draft:
        draft &&
        ('page' in draft
          ? draft.page.pageObjectNumber === pageObjectNumber
          : 'ids' in draft
            ? draft.ids.some(onPage)
            : onPage(draft.id))
          ? draft
          : null,
      preview: whole.preview?.byPage[pageObjectNumber] ? whole.preview : null,
      settings: [whole.style, whole.defaults, whole.hitMargin, whole.snap],
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
