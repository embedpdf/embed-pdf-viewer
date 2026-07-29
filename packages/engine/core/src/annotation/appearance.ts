import type { PdfRect } from '../geometry/primitives';
import type { AnnotationDTO, WireAnnotationPatch } from './kinds';

/**
 * Appearance-impact classification: the shared, pure decision for whether an
 * update patch requires re-baking the `/AP` normal appearance stream.
 *
 * An `/AP` stream is CONTENT, not cache — a foreign producer's appearance
 * (Acrobat's rich `/AP`, an image-backed stamp) generally cannot be
 * recomputed, so destroying it is only acceptable as the explicit consequence
 * of a semantic edit. Per ISO 32000 §12.5.5 a form XObject's `BBox` is
 * algorithmically fitted into `/Rect`, so a same-size `/Rect` change
 * translates the painted pixels verbatim: preservation on a verified rigid
 * translation is a theorem, not a policy. The engine therefore never trusts a
 * caller's claim of "this is just a move" — it checks the geometric fact that
 * licenses preservation.
 *
 * The classifier compares in DTO space on both sides (the patch vocabulary IS
 * the DTO vocabulary, produced by the same readers), so value-diffing drops
 * no-op keys even from clients that send full-object patches. Unknown keys
 * and unknown subtypes classify as `regenerate` — conservative by default.
 */
export type AppearanceImpact =
  /** Nothing appearance-affecting changed value — never touch `/AP`. */
  | 'inert'
  /** A verified rigid translation — pixels identical up to translation. */
  | 'translation'
  /** A semantic appearance edit — the owner re-bakes `/AP`. */
  | 'regenerate';

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
 * Keys that never affect `/AP` on any kind: the discriminator, behavioral
 * flags, reply relationships, and grouping.
 */
const INERT_KEYS: ReadonlySet<string> = new Set([
  'subtype',
  'flags',
  'inReplyTo',
  'replyType',
  'groupId',
]);

/**
 * Kinds whose `/AP` paints `/Contents`. Everywhere else `contents` is popup
 * note text — editing a comment must never re-bake (or destroy) the shape's
 * appearance.
 */
const CONTENTS_PAINTED: ReadonlySet<string> = new Set(['free-text', 'redact']);

/**
 * The vertex family's `/EMBD_Metadata/Rotation` is an advisory scalar (the
 * vertices are already rotated); it never drives the AP generator, so patches
 * touching it are appearance-inert for these kinds.
 */
const ADVISORY_ROTATION: ReadonlySet<string> = new Set(['line', 'polyline', 'polygon', 'ink']);

/**
 * The box kinds couple `rect` to the `/EMBD_Metadata` transform pair: any
 * rect-bearing patch reconciles `rotation` + `unrotatedRect` (absent clears
 * them), so translation verification must check the whole group.
 */
const BOX_TRANSFORM: ReadonlySet<string> = new Set(['square', 'circle', 'free-text']);

/**
 * Per-kind absolute-geometry fields (PDF user space) that a rigid translation
 * shifts together. A kind absent from this table never takes the translation
 * route. `rect` is required in every entry: a translation always moves `/Rect`.
 */
const TRANSLATABLE_GEOMETRY: Record<string, readonly string[]> = {
  square: ['rect', 'unrotatedRect'],
  circle: ['rect', 'unrotatedRect'],
  'free-text': ['rect', 'unrotatedRect', 'calloutLine'],
  line: ['rect', 'linePoints'],
  polygon: ['rect', 'vertices'],
  polyline: ['rect', 'vertices'],
  ink: ['rect', 'inkList'],
  highlight: ['rect', 'quadPoints'],
  underline: ['rect', 'quadPoints'],
  squiggly: ['rect', 'quadPoints'],
  strikeout: ['rect', 'quadPoints'],
  redact: ['rect', 'quadPoints'],
  caret: ['rect'],
  text: ['rect'],
  stamp: ['rect'],
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
 * Numbers compare within {@link EPSILON}; `null` and `undefined` both mean
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
 * Verify the touched geometry is one rigid translation of the current state.
 * Requires `patch.rect` (a translation always moves `/Rect`) with width and
 * height preserved; every other geometry field present on the annotation must
 * ride along shifted by the same delta — a rect move that leaves `vertices`
 * behind is NOT a translation (the dictionary would desync from the pixels).
 * For box kinds the `/EMBD_Metadata` transform group is checked too, because
 * the writer reconciles it on every rect write (absent fields clear).
 */
function isRigidTranslation(
  cur: Record<string, unknown>,
  pat: Record<string, unknown>,
  subtype: string,
  geometryKeys: readonly string[],
): boolean {
  const curRect = cur.rect as PdfRect | undefined;
  const patRect = pat.rect as PdfRect | undefined;
  if (!curRect || !patRect) return false;
  const dx = patRect.left - curRect.left;
  const dy = patRect.bottom - curRect.bottom;
  if (!numEq(patRect.right - patRect.left, curRect.right - curRect.left)) return false;
  if (!numEq(patRect.top - patRect.bottom, curRect.top - curRect.bottom)) return false;

  if (BOX_TRANSFORM.has(subtype)) {
    // The rect write reconciles the transform pair: what the patch omits gets
    // CLEARED. Compare the after-state, not the patch keys.
    if (!numEq(normDeg(cur.rotation), normDeg(pat.rotation))) return false;
    if (normDeg(pat.rotation) !== 0 && pat.unrotatedRect == null) return false;
  }

  for (const key of geometryKeys) {
    if (key === 'rect') continue;
    const c = cur[key];
    const p = pat[key];
    if (c == null && p == null) continue; // absent on both — nothing to shift
    if (c == null || p == null) return false; // geometry appearing/vanishing
    if (!shiftedBy(c, p, dx, dy)) return false;
  }
  return true;
}

/**
 * Classify an update patch against the annotation's current DTO.
 *
 * 1. Value-diff: drop keys whose value semantically equals the current one,
 *    plus the always-inert metadata keys (and per-kind inert keys: `contents`
 *    where it isn't painted, advisory `rotation` on the vertex family).
 *    Nothing left → `'inert'`.
 * 2. If every remaining key is translatable geometry for this kind AND the
 *    values are one rigid translation → `'translation'`.
 * 3. Anything else — style, text, unknown keys, unknown kinds → `'regenerate'`.
 */
export function appearanceImpactOf(
  current: AnnotationDTO,
  patch: WireAnnotationPatch,
): AppearanceImpact {
  if (patch.subtype !== current.subtype) return 'regenerate';

  const cur = current as unknown as Record<string, unknown>;
  const pat = patch as unknown as Record<string, unknown>;
  const subtype = patch.subtype;

  const touched: string[] = [];
  for (const [key, value] of Object.entries(pat)) {
    if (value === undefined || INERT_KEYS.has(key)) continue;
    if (key === 'contents' && !CONTENTS_PAINTED.has(subtype)) continue;
    if (key === 'rotation' && ADVISORY_ROTATION.has(subtype)) continue;
    if (!semanticEqual(value, cur[key])) touched.push(key);
  }
  if (touched.length === 0) return 'inert';

  const geometryKeys = TRANSLATABLE_GEOMETRY[subtype];
  if (!geometryKeys) return 'regenerate';
  if (!touched.every((k) => geometryKeys.includes(k))) return 'regenerate';
  return isRigidTranslation(cur, pat, subtype, geometryKeys) ? 'translation' : 'regenerate';
}
