import type { Annotation, AnnotationPatch } from './kinds';
import type { AnnotationSubtype } from './subtype';
import type { Coordinates, PdfCoordinates } from '../pageSpace/coordinates';

/**
 * Appearance-impact classification: the shared, pure decision for whether an
 * update patch requires re-baking the `/AP` normal appearance stream.
 *
 * An `/AP` stream is content, not cache — a foreign producer's appearance
 * (Acrobat's rich `/AP`, an image-backed stamp) generally cannot be
 * recomputed, so destroying it is only acceptable as the explicit consequence
 * of a semantic edit. Per ISO 32000 §12.5.5 a form XObject's `BBox` is
 * algorithmically fitted into `/Rect`, so a same-size `/Rect` change
 * translates the painted pixels verbatim: preservation on a verified rigid
 * translation is a theorem, not a policy. The engine therefore never trusts a
 * caller's claim of "this is just a move" — it checks the geometric fact that
 * licenses preservation.
 *
 * The classifier compares in DTO space on both sides (the patch vocabulary is
 * the DTO vocabulary, produced by the same readers), so value-diffing drops
 * no-op keys even from clients that send full-object patches. Unknown keys
 * and unknown subtypes classify as `regenerate` — conservative by default.
 * It reads positions by their axis names only (`x`/`left`/`right`,
 * `y`/`bottom`/`top`), so it classifies the file's values and page-space
 * values alike: a viewer asks the same question the engine does.
 */
export type AppearanceImpact =
  /** Nothing appearance-affecting changed value — never touch `/AP`. */
  | 'inert'
  /** A verified rigid translation — pixels identical up to translation. */
  | 'translation'
  /** A semantic appearance edit — the owner re-bakes `/AP`. */
  | 'regenerate';

/**
 * An update's appearance impact, with the distance a `translation` moves the
 * drawing by, in the coordinates of the values classified.
 */
export type AppearanceChange =
  | { readonly impact: 'inert' }
  | { readonly impact: 'translation'; readonly by: { readonly x: number; readonly y: number } }
  | { readonly impact: 'regenerate' };

/**
 * The kinds a write gives no appearance of the engine's: a link, which the
 * engine writes with no border to draw, and a form widget, which its form
 * field draws (one on its own has nothing to draw). A write leaves whether
 * the file holds one as it was, and a new one has none. Every other kind's
 * create bakes one, and so does every change to it that is visible and not a
 * pure move.
 */
export const UNBAKED_KINDS: ReadonlySet<AnnotationSubtype> = new Set(['link', 'widget']);

/** What actually happened to `/AP` during an update (the engine's echo). */
export type AppearanceAction = 'preserved' | 'regenerated' | 'generation-unavailable';

/**
 * The appearance verdict every `AnnotationUpdateResult` carries. `changed`
 * (not `action`) is the raster-invalidation signal: `true` iff the document's
 * appearance definition changed — a regenerated `/AP`, or appearance-affecting
 * dictionary writes on a subtype the generic generator cannot re-bake.
 */
export interface AppearanceOutcome {
  action: AppearanceAction;
  changed: boolean;
}

/**
 * Coordinate tolerance in PDF user-space points. PDF numbers round-trip
 * through f32 (~7 significant digits) and client-side space conversions, so
 * exact float equality would misclassify no-op writes; 1e-3 pt is far below
 * anything visible while far above accumulated f32 drift at page magnitudes.
 */
const EPSILON = 1e-3;

/**
 * Keys that never affect `/AP` on any kind: the discriminator, the `/F`
 * flags, the name, relationships and grouping, the conversation-plane
 * entries (`/Subj` subject line, `/State` + `/StateModel` review status —
 * dictionary-only per ISO 32000 §12.5.6.3, never painted), and the fields a
 * write accepts but never applies (addresses, attribution, `/A` and `/AA`).
 */
const INERT_KEYS: ReadonlySet<string> = new Set([
  'subtype',
  'invisible',
  'hidden',
  'print',
  'noZoom',
  'noRotate',
  'noView',
  'readOnly',
  'locked',
  'toggleNoView',
  'lockedContents',
  'nm',
  'reply',
  'popup',
  'parent',
  // Whether a comment window shows open: the window's state, never painted.
  'open',
  'groupId',
  'subject',
  'state',
  'stateModel',
  'ref',
  'page',
  'index',
  'identityQuality',
  'hasAppearance',
  'author',
  'createdAt',
  'modifiedAt',
  'userId',
  'createdBy',
  'modifiedBy',
  'importedBy',
  'actions',
  // A file attachment's icon is drawn from `/Name` and `/C`, never from its file.
  'file',
]);

/**
 * Kinds whose `/AP` paints `/Contents`. Everywhere else `contents` is popup
 * note text — editing a comment must never re-bake (or destroy) the shape's
 * appearance.
 */
const CONTENTS_PAINTED: ReadonlySet<string> = new Set(['free-text', 'redact']);

/**
 * The kinds that turn by `rotation`: a box kind about the middle of its
 * `box`, a point kind about the middle of its points' box. Tri-state on
 * writes: an omitted rotation is kept, `null` (or `0`) clears it. Translation
 * verification therefore compares the after-state —
 * `patch.rotation ?? current.rotation` — not the patch keys.
 */
const TURNING_KINDS: ReadonlySet<string> = new Set([
  'square',
  'circle',
  'free-text',
  'stamp',
  'caret',
  'line',
  'polyline',
  'polygon',
  'ink',
]);

/**
 * Per-kind absolute-geometry fields (PDF user space) that a rigid translation
 * shifts together. A kind absent from this table never takes the translation
 * route. The first is where a move shows: the field the caller gives the
 * shape in (a `box`, the points, the quads), or `rect` where that is the
 * shape. A `rect` the engine works out moves with it.
 */
const TRANSLATABLE_GEOMETRY: Record<string, readonly string[]> = {
  square: ['box'],
  circle: ['box'],
  'free-text': ['box', 'calloutLine'],
  line: ['linePoints'],
  polygon: ['vertices'],
  polyline: ['vertices'],
  ink: ['inkList'],
  highlight: ['quadPoints'],
  underline: ['quadPoints'],
  squiggly: ['quadPoints'],
  strikeout: ['quadPoints'],
  redact: ['rect', 'quadPoints'],
  caret: ['box'],
  text: ['rect'],
  stamp: ['box'],
  'file-attachment': ['rect'],
  link: ['rect'],
};

const numEq = (a: number, b: number): boolean => Math.abs(a - b) <= EPSILON;

/** Degrees normalized to [0,360); absent reads as 0 (no rotation). */
const normDeg = (v: unknown): number => {
  const n = typeof v === 'number' ? ((v % 360) + 360) % 360 : 0;
  return n;
};

/**
 * Semantic equality between a patch value and the current DTO value.
 * Numbers compare within {@link epsilon}; `null` and `undefined` both mean
 * "entry absent" (the tri-state clear of an absent entry is a no-op); arrays
 * and objects compare structurally.
 */
export function semanticEqual(a: unknown, b: unknown): boolean {
  if (a == null || b == null) return a == null && b == null;
  if (typeof a === 'number' && typeof b === 'number') return numEq(a, b);
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
    return a.every((v, i) => semanticEqual(v, b[i]));
  }
  if (typeof a === 'object' && typeof b === 'object') {
    const keys = new Set([...Object.keys(a), ...Object.keys(b as object)]);
    for (const k of keys) {
      if (!semanticEqual((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k])) {
        return false;
      }
    }
    return true;
  }
  return a === b;
}

/**
 * Is `next` exactly `cur` shifted by `(dx, dy)`? Walks the value structurally:
 * numeric leaves under x-axis keys (`left`/`right`/`x`) must shift by `dx`,
 * y-axis keys (`bottom`/`top`/`y`) by `dy`, and any other numeric leaf must be
 * unchanged. Arrays walk elementwise (same length required).
 */
function shiftedBy(cur: unknown, next: unknown, dx: number, dy: number): boolean {
  if (cur == null || next == null) return cur == null && next == null;
  if (Array.isArray(cur) || Array.isArray(next)) {
    if (!Array.isArray(cur) || !Array.isArray(next) || cur.length !== next.length) return false;
    return cur.every((v, i) => shiftedBy(v, next[i], dx, dy));
  }
  if (typeof cur === 'object' && typeof next === 'object') {
    const keys = new Set([...Object.keys(cur), ...Object.keys(next as object)]);
    for (const k of keys) {
      const c = (cur as Record<string, unknown>)[k];
      const n = (next as Record<string, unknown>)[k];
      if (typeof c === 'number' && typeof n === 'number') {
        const delta =
          k === 'left' || k === 'right' || k === 'x'
            ? dx
            : k === 'bottom' || k === 'top' || k === 'y'
              ? dy
              : 0;
        if (!numEq(c + delta, n)) return false;
      } else if (!shiftedBy(c, n, dx, dy)) {
        return false;
      }
    }
    return true;
  }
  return cur === next;
}

/**
 * The first point a geometry value holds: a rect's bottom-left, a point, a
 * line's start, a quad's first corner, the first of a list.
 */
function firstPoint(value: unknown): { x: number; y: number } | undefined {
  if (value == null || typeof value !== 'object') return undefined;
  if (Array.isArray(value)) return value.length > 0 ? firstPoint(value[0]) : undefined;
  const record = value as Record<string, unknown>;
  if (typeof record.x === 'number' && typeof record.y === 'number') {
    return { x: record.x, y: record.y };
  }
  if (typeof record.left === 'number' && typeof record.bottom === 'number') {
    return { x: record.left, y: record.bottom };
  }
  return firstPoint(record.start ?? record.upperLeft);
}

/**
 * The distance the touched geometry moves by, when it is one rigid
 * translation of the current state; `null` when it isn't. Requires the kind's
 * first geometry field in the patch; it and every other geometry field
 * present on the annotation must ride along shifted by the same delta — a box
 * resized, or a leader left behind by a moved text box, is not a translation
 * (the dictionary would desync from the pixels). For the kinds that turn, the
 * turn is checked as an after-state: an omitted rotation keeps the current
 * one.
 */
function rigidTranslationOf(
  cur: Record<string, unknown>,
  pat: Record<string, unknown>,
  subtype: string,
  geometryKeys: readonly string[],
): { x: number; y: number } | null {
  const [anchor] = geometryKeys;
  const from = firstPoint(cur[anchor!]);
  const to = firstPoint(pat[anchor!]);
  if (!from || !to) return null;
  const dx = to.x - from.x;
  const dy = to.y - from.y;

  if (TURNING_KINDS.has(subtype)) {
    // Tri-state writes: an omitted rotation preserves the current one; `null`
    // clears (≡ 0). Compare the resulting after-state.
    const rotAfter = pat.rotation === undefined ? cur.rotation : pat.rotation;
    if (!numEq(normDeg(cur.rotation), normDeg(rotAfter))) return null;
  }

  for (const key of geometryKeys) {
    const c = cur[key];
    const p = pat[key];
    if (c == null && p == null) continue; // absent on both — nothing to shift
    if (c == null || p == null) return null; // geometry appearing/vanishing
    if (!shiftedBy(c, p, dx, dy)) return null;
  }
  return { x: dx, y: dy };
}

const INERT: AppearanceChange = { impact: 'inert' };
const REGENERATE: AppearanceChange = { impact: 'regenerate' };

/**
 * Classify an update patch against the annotation's current read, in either
 * space, with the distance a translation moves the drawing by.
 *
 * 1. Value-diff: drop keys whose value semantically equals the current one,
 *    plus the always-inert metadata keys (and per-kind inert keys: `contents`
 *    where it isn't painted).
 *    Nothing left → `'inert'`.
 * 2. If every remaining key is translatable geometry for this kind and the
 *    values are one rigid translation → `'translation'`, by how far.
 * 3. Anything else — style, text, unknown keys, unknown kinds → `'regenerate'`.
 */
export function appearanceChangeOf<C extends Coordinates>(
  current: Annotation<C>,
  patch: AnnotationPatch<C>,
): AppearanceChange {
  if (patch.subtype !== undefined && patch.subtype !== current.subtype) return REGENERATE;

  const cur = current as unknown as Record<string, unknown>;
  const pat = patch as unknown as Record<string, unknown>;
  const subtype = current.subtype;
  const captionEnabled = pat.captionEnabled === undefined ? cur.captionEnabled : pat.captionEnabled;
  const contentsPainted =
    CONTENTS_PAINTED.has(subtype) ||
    (['line', 'polygon', 'polyline'].includes(subtype) && captionEnabled === true);

  const touched: string[] = [];
  for (const [key, value] of Object.entries(pat)) {
    if (value === undefined || INERT_KEYS.has(key)) continue;
    if (key === 'contents' && !contentsPainted) continue;
    if (!semanticEqual(value, cur[key])) touched.push(key);
  }
  if (touched.length === 0) return INERT;

  const baseGeometryKeys = TRANSLATABLE_GEOMETRY[subtype];
  // A manual shape caption is page-space geometry and must ride with a rigid
  // move. Automatic centers follow the vertices without an explicit patch.
  const geometryKeys =
    baseGeometryKeys && (subtype === 'polygon' || subtype === 'polyline') && cur.captionCenter
      ? [...baseGeometryKeys, 'captionCenter']
      : baseGeometryKeys;
  if (!geometryKeys) return REGENERATE;
  if (!touched.every((k) => geometryKeys.includes(k))) return REGENERATE;
  const by = rigidTranslationOf(cur, pat, subtype, geometryKeys);
  return by ? { impact: 'translation', by } : REGENERATE;
}

/** {@link appearanceChangeOf}'s verdict alone, on the file's values: what the engine's update decides. */
export function appearanceImpactOf(
  current: Annotation<PdfCoordinates>,
  patch: AnnotationPatch<PdfCoordinates>,
): AppearanceImpact {
  return appearanceChangeOf(current, patch).impact;
}
