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
 * A pending change holds exactly what one engine write carries (a record's
 * new flags, its new geometry, its typed text), so settling one write never
 * touches other outstanding work on the same record. A refused change is
 * dropped at once: the view shows the engine's record again, never a copy
 * taken before the write. An accepted change is dropped once the confirmed
 * record holds it and every older change of that record has settled, so the
 * view never falls back to an older version of what the user did.
 */
import { initialSession, sameSession } from '@embedpdf/core-annotation';
import type { Id, ModelAnnotation, Session } from '@embedpdf/core-annotation';

import type { AnnotationConfig, ChromeSettings, ChromeSettingsPatch, ToolGhost } from './contract';
import type { TextSelection } from './rich-text';

/** What one pending change does to its record. */
export type RecordChange =
  /** A record this session created, not yet confirmed. */
  | { readonly kind: 'create'; readonly record: ModelAnnotation }
  /** New values for some of a record's fields: exactly what one write carries. */
  | { readonly kind: 'edit'; readonly fields: Partial<ModelAnnotation> }
  /** The user deleted the record. */
  | { readonly kind: 'delete' };

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
  readonly chrome: ChromeSettings;
  /**
   * The armed tool's footprint ghost: where, and what, the next click would
   * place (a stamp's fitted image box, or a click-create tool's default
   * geometry), computed by the same rules placement uses. It is state
   * because it is rendered: vector ghosts ride `pageItems`, image ghosts
   * render through the framework's `ToolGhost`. The armed bytes stay out of state.
   */
  readonly toolGhost: ToolGhost | null;
  /**
   * The text editor's selection inside the annotation being edited (flat
   * offsets over its plain text), or null. It is state because the property
   * surface reads it: while a range is held, the text style keys report and
   * change the runs, not the whole body.
   */
  readonly textSelection: TextSelection | null;
}

/**
 * Out-of-the-box selection chrome — a sensible document-annotation feel. Every
 * length is CSS px (screen-constant across zoom); every color falls back to
 * `accent`. Just defaults: override any field at registration
 * (`annotationPlugin({ chrome })`) or at runtime (`setChrome`).
 */
export const DEFAULT_CHROME: ChromeSettings = {
  accent: '#3858e9',
  // Solid, like the shape's own resting look — one style at rest and rotated.
  outline: { style: 'solid', width: 1 },
  // 8px squares to look at, 24px to grab (touch-friendly without visual bulk).
  handles: { size: 8, hitSize: 24, fill: '#ffffff' },
  knob: { size: 10, hitSize: 24, offset: 32, stalk: true, fill: '#ffffff' },
  // A faint reference cross and a prominent live indicator.
  guides: { enabled: true, style: 'solid', width: 1, axisOpacity: 0.35, indicatorOpacity: 0.8 },
};

/** Deep-partial merge of a chrome patch — one level per piece, like the
 *  stage-settings convention (align pairs / pageFrame). */
export const mergeChrome = (base: ChromeSettings, patch: ChromeSettingsPatch): ChromeSettings => ({
  accent: patch.accent ?? base.accent,
  outline: { ...base.outline, ...patch.outline },
  handles: { ...base.handles, ...patch.handles },
  knob: { ...base.knob, ...patch.knob },
  guides: { ...base.guides, ...patch.guides },
});

/** The initial state; the registration config seeds the session's snapping and the chrome. */
export const initialAnnotationState = (config: AnnotationConfig = {}): AnnotationState => ({
  session: { ...initialSession, snap: { ...initialSession.snap, ...config.snap } },
  pending: [],
  vector: {},
  chrome: mergeChrome(DEFAULT_CHROME, config.chrome ?? {}),
  toolGhost: null,
  textSelection: null,
});

/* ── the session and pending changes ─────────────────────────────────────── */

/** The top-level fields whose value differs between two versions of a record. */
export function changedFields(
  before: ModelAnnotation,
  after: ModelAnnotation,
): Partial<ModelAnnotation> {
  const fields: Record<string, unknown> = {};
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]) as Set<
    keyof ModelAnnotation
  >;
  for (const key of keys) if (before[key] !== after[key]) fields[key] = after[key];
  return fields as Partial<ModelAnnotation>;
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

/**
 * A record got another key: a new record was confirmed (`new:<n>` becomes the
 * engine's key), or the engine named a weak record. Its pending changes and
 * render preference follow it, and so do records that point at it. A new
 * record's `create` change goes: the confirmed record shows now.
 */
export function followRecord(state: AnnotationState, from: Id, to: Id): AnnotationState {
  const points = (record: Partial<ModelAnnotation>) => record.irt === from || record.group === from;
  const repoint = <T extends Partial<ModelAnnotation>>(record: T): T => ({
    ...record,
    ...(record.irt === from ? { irt: to } : {}),
    ...(record.group === from ? { group: to } : {}),
  });
  const touched = state.pending.some(
    (pending) =>
      pending.id === from ||
      (pending.change.kind === 'create' && points(pending.change.record)) ||
      (pending.change.kind === 'edit' && points(pending.change.fields)),
  );
  if (!touched && !state.vector[from]) return state;
  const pending: PendingChange[] = [];
  for (const entry of state.pending) {
    if (entry.id === from && entry.change.kind === 'create') continue;
    const id = entry.id === from ? to : entry.id;
    const change: RecordChange =
      entry.change.kind === 'create' && points(entry.change.record)
        ? { kind: 'create', record: repoint(entry.change.record) }
        : entry.change.kind === 'edit' && points(entry.change.fields)
          ? { kind: 'edit', fields: repoint(entry.change.fields) }
          : entry.change;
    pending.push(id === entry.id && change === entry.change ? entry : { ...entry, id, change });
  }
  const { [from]: preferred, ...vector } = state.vector;
  return { ...state, pending, vector: preferred ? { ...vector, [to]: true } : state.vector };
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

/* ── chrome, ghost and text selection ────────────────────────────────────── */

export const patchChrome = (
  state: AnnotationState,
  patch: ChromeSettingsPatch,
): AnnotationState => ({
  ...state,
  chrome: mergeChrome(state.chrome, patch),
});

export const setToolGhost = (
  state: AnnotationState,
  toolGhost: ToolGhost | null,
): AnnotationState => (state.toolGhost === toolGhost ? state : { ...state, toolGhost });

export const setTextSelection = (
  state: AnnotationState,
  textSelection: TextSelection | null,
): AnnotationState => (state.textSelection === textSelection ? state : { ...state, textSelection });
