/**
 * The annotation plugin's state and its transitions.
 *
 * Three kinds of data make up what the user sees, and each has one owner:
 *
 *   confirmed  the engine's records             the records mirror (sync/records.ts)
 *   pending    this session's changes the       the kernel's change queue (`ctx.changes`);
 *              engine hasn't answered           the records mirror predicts them
 *   session    selection, gestures, settings    `session` below, produced by the core's `update`
 *
 * The view (read/view.ts) composes the session with the records as the
 * mirror shows them (`records.view()`) into the core's `Model`.
 */
import { initialSession, sameSession } from '@embedpdf/core-annotation';
import type { Id, Point, Session, SnapSettings } from '@embedpdf/core-annotation';
import type { PageRotation } from '@embedpdf/core-geometry';
import type { PageRef } from '@embedpdf/engine-core/runtime';

import type { TextSelection } from './rich-text';

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
  /**
   * Records this session renders from their description instead of the
   * engine's raster: the ones it edited or created. Another session's edit
   * hands a record back to the raster (see sync/confirmed.ts).
   */
  readonly vector: Readonly<Record<Id, true>>;
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
  session: initialSession,
  vector: {},
  ghostAt: null,
  placing: null,
  textSelection: null,
});

/** The session snaps as the settings say. */
export const withSnap = (state: AnnotationState, snap: SnapSettings): AnnotationState =>
  state.session.snap === snap ? state : { ...state, session: { ...state.session, snap } };

/* ── the session and render preferences ──────────────────────────────── */

/**
 * Record one message's session. The records it changed and drew live
 * (`vector`) render live from now on: this session's appearance is the one
 * its own painter draws.
 */
export function withSession(
  state: AnnotationState,
  session: Session,
  vector: readonly Id[] = [],
): AnnotationState {
  const next = sameSession(state.session, session) ? state : { ...state, session };
  return preferVector(next, vector);
}

/** The session holds these object numbers too, for the records it creates next. */
export const withObjectNumbers = (
  state: AnnotationState,
  numbers: readonly number[],
): AnnotationState =>
  numbers.length
    ? {
        ...state,
        session: {
          ...state.session,
          objectNumbers: [...state.session.objectNumbers, ...numbers],
        },
      }
    : state;

/** The session lost these object numbers: the engine refuses a create that names one. */
export function withoutObjectNumbers(
  state: AnnotationState,
  lost: readonly number[],
): AnnotationState {
  const gone = new Set(lost);
  const objectNumbers = state.session.objectNumbers.filter((number) => !gone.has(number));
  return objectNumbers.length === state.session.objectNumbers.length
    ? state
    : { ...state, session: { ...state.session, objectNumbers } };
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

/* ── ghost and text selection ─────────────────────────────────────────────── */

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
