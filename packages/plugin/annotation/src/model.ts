/**
 * The annotation plugin's state and its transitions.
 *
 * Three kinds of data make up what the user sees, and each has one owner:
 *
 *   confirmed  the engine's records             the records mirror (sync/records.ts)
 *   pending    the user's unconfirmed changes   `pending` below, one per engine write
 *   session    selection, gestures, settings    `session` below, produced by the core's `update`
 *
 * The view (read/view.ts) lays the pending changes over the confirmed records
 * and composes the session with them into the core's `Model`.
 *
 * A pending edit holds the engine patch its write carries (a record's new
 * flags, its new geometry, its typed text), beside how the record is drawn
 * after it, so settling one write never touches other outstanding work on
 * the same record. A refused change is
 * dropped at once: the view shows the engine's record again, never a copy
 * taken before the write. An accepted change is dropped once the confirmed
 * record holds it and every older change of that record has settled, so the
 * view never falls back to an older version of what the user did.
 */
import { annotationAfter, initialSession, sameSession } from '@embedpdf/core-annotation';
import type { Id, ModelAnnotation, Point, Session, SnapSettings } from '@embedpdf/core-annotation';
import type { PageRotation } from '@embedpdf/core-geometry';
import {
  annotationKey,
  generateUuid,
  reorderedList,
  reorderPart,
  type Annotation,
  type AnnotationPatch,
  type AnnotationRef,
  type ListPosition,
  type PageRef,
} from '@embedpdf/engine-core/runtime';

import type { TextSelection } from './rich-text';

/** What one pending change does to its record. */
export type RecordChange =
  /** A record this session created, not yet confirmed. */
  | { readonly kind: 'create'; readonly record: ModelAnnotation }
  /**
   * An edit: the engine patch its write carries (none when the engine keeps
   * nothing of it), and how the record is drawn after it (live, or its raster
   * moved). The view lays the patch over the record's annotation, as the
   * engine will apply it, and the rest over the record.
   */
  | {
      readonly kind: 'edit';
      readonly patch?: AnnotationPatch;
      readonly fields: Partial<Omit<ModelAnnotation, 'annotation'>>;
    }
  /** The user deleted the record. */
  | { readonly kind: 'delete' };

/**
 * `record` with a pending edit laid over it: how it is drawn after the edit,
 * and its annotation as the engine will read it back (`annotationAfter`). A
 * patch the record no longer takes (another session changed it under the
 * edit) is one the engine will refuse: the annotation shows as it is until
 * that refusal drops the change.
 */
export function withPendingEdit(
  record: ModelAnnotation,
  edit: Extract<RecordChange, { kind: 'edit' }>,
): ModelAnnotation {
  const drawn = { ...record, ...edit.fields };
  if (!edit.patch) return drawn;
  try {
    return { ...drawn, annotation: annotationAfter(record.annotation, edit.patch) };
  } catch {
    return drawn;
  }
}

/** One unconfirmed change to one record, carried by one engine write. */
export interface PendingChange {
  /** Unique and never reused: the write that carries this change settles exactly it. */
  readonly token: number;
  /** The record it changes. When the record gets another key, the change follows it. */
  readonly id: Id;
  readonly change: RecordChange;
  /** The engine accepted the write; the change waits for older changes of its record to settle. */
  readonly written?: true;
}

/** Where the active tool's ghost is: the pointer on a page, and how that page shows there. */
export interface GhostPointer {
  readonly toolId: string;
  readonly page: PageRef;
  readonly point: Point;
  /** The page's display rotation at the pointer (an upright tool lays its click out as seen). */
  readonly displayRotation?: PageRotation;
  /** The page's zoom at the pointer (a screen-sized icon's size depends on it). */
  readonly zoom?: number;
}

/**
 * A change of a page's drawing order the engine hasn't confirmed yet: these
 * records go to `position` among the page's others, in this order. The view
 * shows it at once.
 */
export interface PendingReorder {
  /** Unique: the write that carries it removes exactly it. */
  readonly token: number;
  readonly page: number;
  readonly ids: readonly Id[];
  readonly position: ListPosition<Id>;
}

/**
 * `order` with one page's `ids` moved to `position` among that page's other
 * records, in the order given: the engine's rule for a reorder. Other pages
 * keep their places. Unchanged when the engine would refuse it (a record or
 * the neighbour no longer on the page): the view shows what can happen.
 */
export function reorderInOrder(
  order: readonly Id[],
  onPage: (id: Id) => boolean,
  ids: readonly Id[],
  position: ListPosition<Id>,
): Id[] {
  let page: Id[];
  try {
    page = reorderedList(order.filter(onPage), ids, position, sameId);
  } catch {
    return [...order];
  }
  return reorderPart(order, onPage, page, sameId);
}

const sameId = (id: Id) => id;

/** A sibling plugin's placement gesture with one of this plugin's tools: its press, and the pointer now. */
export interface ForeignPlacement {
  readonly toolId: string;
  readonly page: PageRef;
  readonly from: Point;
  readonly to: Point;
}

export interface AnnotationState {
  /** The core's session: selection, hover, the gesture in progress, tool settings. */
  readonly session: Session;
  /** The user's unconfirmed changes, oldest first. */
  readonly pending: readonly PendingChange[];
  /**
   * Records this session renders from their description instead of the
   * engine's raster: the ones it edited or created. Another session's edit
   * hands a record back to the raster (see sync/confirmed.ts).
   */
  readonly vector: Readonly<Record<Id, true>>;
  /** Drawing-order changes the engine hasn't confirmed yet, oldest first. */
  readonly reorders: readonly PendingReorder[];
  /**
   * Where the active tool's ghost is: the pointer, while a click there would
   * make something. Only the pointer is state; what the ghost paints is
   * derived from it and the tool's live defaults (tools/ghost.ts).
   */
  readonly ghostAt: GhostPointer | null;
  /**
   * A placement a sibling plugin's gesture is making with one of this
   * plugin's tools (the form palette's drag-to-place). Once it is a drag it
   * paints as a drawing in progress (tools/ghost.ts).
   */
  readonly placing: ForeignPlacement | null;
  /**
   * The text editor's selection inside the annotation being edited (flat
   * offsets over its plain text), or null. It is state because the property
   * surface reads it: while a range is held, the text style keys report and
   * change the runs, not the whole body.
   */
  readonly textSelection: TextSelection | null;
}

/** The initial state. The session's snapping comes from the settings (`withSnap`). */
export const initialAnnotationState = (): AnnotationState => ({
  session: {
    ...initialSession,
    // Each session names the annotations it creates apart from every other session's.
    namePrefix: `${generateUuid()}-`,
  },
  pending: [],
  vector: {},
  reorders: [],
  ghostAt: null,
  placing: null,
  textSelection: null,
});

/** The session snaps as the settings say. */
export const withSnap = (state: AnnotationState, snap: SnapSettings): AnnotationState =>
  state.session.snap === snap ? state : { ...state, session: { ...state.session, snap } };

/* ── the session and pending changes ─────────────────────────────────────── */

/**
 * The top-level fields whose value differs between two versions of a record,
 * its annotation aside: how it is drawn, which an edit carries beside its patch.
 */
export function changedFields(
  before: ModelAnnotation,
  after: ModelAnnotation,
): Partial<Omit<ModelAnnotation, 'annotation'>> {
  const fields: Record<string, unknown> = {};
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]) as Set<
    keyof ModelAnnotation
  >;
  keys.delete('annotation');
  for (const key of keys) if (before[key] !== after[key]) fields[key] = after[key];
  return fields as Partial<Omit<ModelAnnotation, 'annotation'>>;
}

/**
 * Record one message's result: its session, and its changes. Records the
 * changes make render live from now on.
 */
export function stage(
  state: AnnotationState,
  session: Session,
  changes: readonly PendingChange[],
): AnnotationState {
  const sessionChanged = !sameSession(state.session, session);
  if (!sessionChanged && !changes.length) return state;
  let vector = state.vector;
  for (const { id, change } of changes) {
    const source =
      change.kind === 'create'
        ? change.record.source
        : change.kind === 'edit'
          ? change.fields.source
          : undefined;
    if (source === 'vector' && !vector[id]) vector = { ...vector, [id]: true };
  }
  return {
    ...state,
    session: sessionChanged ? session : state.session,
    pending: changes.length ? [...state.pending, ...changes] : state.pending,
    vector,
  };
}

/**
 * The writes carrying these changes settled. A refused change goes at once;
 * an accepted one is marked written and goes once every older change of its
 * record has settled.
 */
export function writeSettled(
  state: AnnotationState,
  tokens: readonly number[],
  outcome: 'accepted' | 'refused',
): AnnotationState {
  const settled = new Set(tokens);
  if (!state.pending.some((pending) => settled.has(pending.token))) return state;
  const marked =
    outcome === 'refused'
      ? state.pending.filter((pending) => !settled.has(pending.token))
      : state.pending.map((pending) =>
          settled.has(pending.token) ? { ...pending, written: true as const } : pending,
        );
  // Release written changes that have no unsettled older change of their record.
  const blocked = new Set<Id>();
  const pending = marked.filter((change) => {
    if (change.written && !blocked.has(change.id)) return false;
    blocked.add(change.id);
    return true;
  });
  return { ...state, pending };
}

/** The `/IRT` a patch writes, if it writes one. */
const replyOf = (patch: AnnotationPatch | undefined): { to: AnnotationRef } | null | undefined =>
  (patch as { reply?: { to: AnnotationRef } | null } | undefined)?.reply;

/**
 * A record got another key: a new record was confirmed (the key of the `nm`
 * ref it was written under becomes the engine's key, and `ref` its
 * annotation's ref). Its pending changes, render preference and text range follow it, and so do
 * the annotations that answer it: their `/IRT` names it by `ref`. A new
 * record's `create` change stays, under the confirmed key, until its write
 * settles: the records mirror may not hold the record yet (a page read that
 * started before the create is still running).
 */
export function followRecord(
  state: AnnotationState,
  from: Id,
  to: Id,
  ref: AnnotationRef,
): AnnotationState {
  const answers = (reply: { to: AnnotationRef } | null | undefined): boolean =>
    !!reply && annotationKey(reply.to) === from;
  const answering = (annotation: Annotation): Annotation =>
    annotation.reply && answers(annotation.reply)
      ? { ...annotation, reply: { ...annotation.reply, to: ref } }
      : annotation;
  /** The new record `from`, confirmed: keyed `to`, its annotation under the engine's ref. */
  const confirmed = ({ unconfirmed: _waiting, ...record }: ModelAnnotation): ModelAnnotation => ({
    ...record,
    id: to,
    annotation: { ...record.annotation, ref },
  });
  const touched = state.pending.some(
    (pending) =>
      pending.id === from ||
      (pending.change.kind === 'create' && answers(pending.change.record.annotation.reply)) ||
      (pending.change.kind === 'edit' && answers(replyOf(pending.change.patch))),
  );
  const textSelection =
    state.textSelection?.id === from ? { ...state.textSelection, id: to } : state.textSelection;
  if (!touched && !state.vector[from] && textSelection === state.textSelection) return state;
  const pending = state.pending.map((entry): PendingChange => {
    const { change } = entry;
    const reply = change.kind === 'edit' ? replyOf(change.patch) : null;
    const followed: RecordChange =
      change.kind === 'create' && entry.id === from
        ? { kind: 'create', record: confirmed(change.record) }
        : change.kind === 'create' && answers(change.record.annotation.reply)
          ? {
              kind: 'create',
              record: { ...change.record, annotation: answering(change.record.annotation) },
            }
          : change.kind === 'edit' && reply && answers(reply)
            ? {
                ...change,
                patch: { ...change.patch, reply: { ...reply, to: ref } } as AnnotationPatch,
              }
            : change;
    const id = entry.id === from ? to : entry.id;
    return id === entry.id && followed === change ? entry : { ...entry, id, change: followed };
  });
  const { [from]: preferred, ...vector } = state.vector;
  return {
    ...state,
    pending,
    vector: preferred ? { ...vector, [to]: true } : state.vector,
    textSelection,
  };
}

/** Render these records live from their description. */
export function preferVector(state: AnnotationState, ids: readonly Id[]): AnnotationState {
  const added = ids.filter((id) => !state.vector[id]);
  if (!added.length) return state;
  const vector = { ...state.vector };
  for (const id of added) vector[id] = true;
  return { ...state, vector };
}

/** Render these records from the engine's raster again. */
export function preferBaked(state: AnnotationState, ids: readonly Id[]): AnnotationState {
  const removed = ids.filter((id) => state.vector[id]);
  if (!removed.length) return state;
  const vector = { ...state.vector };
  for (const id of removed) delete vector[id];
  return { ...state, vector };
}

/* ── drawing order, ghost and text selection ─────────────────────────────── */

export const addReorder = (state: AnnotationState, reorder: PendingReorder): AnnotationState => ({
  ...state,
  reorders: [...state.reorders, reorder],
});

export const dropReorder = (state: AnnotationState, token: number): AnnotationState =>
  state.reorders.some((reorder) => reorder.token === token)
    ? { ...state, reorders: state.reorders.filter((reorder) => reorder.token !== token) }
    : state;

export const setGhostAt = (
  state: AnnotationState,
  ghostAt: GhostPointer | null,
): AnnotationState => (state.ghostAt === ghostAt ? state : { ...state, ghostAt });

export const setPlacing = (
  state: AnnotationState,
  placing: ForeignPlacement | null,
): AnnotationState => (state.placing === placing ? state : { ...state, placing });

export const setTextSelection = (
  state: AnnotationState,
  textSelection: TextSelection | null,
): AnnotationState => (state.textSelection === textSelection ? state : { ...state, textSelection });
