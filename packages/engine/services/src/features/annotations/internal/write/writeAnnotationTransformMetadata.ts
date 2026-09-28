import { PdfAnnotationSubtypeCode, type PdfRect } from '@embedpdf/engine-core/runtime';
import type { PdfFunctions, PdfRuntimeMemory, Ptr } from '@embedpdf/engine-runtime';

import { EMBD_METADATA_SCHEMA_VERSION } from './writeEmbedMetadata';
import { RECTF_BYTES } from '../../../../runtime/memory/structs';
import { pdfFromClockwise } from '../read/readAnnotationTransformMetadata';
import {
  isSameAnnotationTurn,
  isTurnableBoxKind,
  readAnnotationTurn,
  readRecordedAnnotationTurn,
  type AnnotationTurn,
} from '../read/readAnnotationTurn';

/**
 * Write the EmbedPDF transform keys under /EMBD_Metadata. This is the seam
 * PDFium's native AP generator reads to bake a rotated appearance:
 *
 *   /EMBD_Metadata <<
 *     /Rotation      -45                   % degrees, PDF convention (CCW)
 *     /UnrotatedRect [x0 y0 x1 y1]         % box kinds only — the box
 *   >>
 *
 * The API's `rotation` is degrees clockwise (the rule every API rotation
 * follows); the file keeps PDF's counterclockwise angle, as the `/AP /Matrix`
 * the generator bakes does, so the angle is negated here, once, and written
 * in (-180, 180] as Acrobat writes its own.
 *
 * The family split:
 *   - box kinds (square/circle/free-text/stamp/caret): `/Rotation` +
 *     `/UnrotatedRect` (`writeBoxTurn`). With both present the AP generator
 *     emits an `/AP /Matrix` that turns the drawing about the box centre. A
 *     stamp, and a free text turned a quarter, also carry Acrobat's
 *     `/Rotate` (`writeAcrobatRotate`).
 *   - vertex kinds (line/polyline/polygon/ink): `/Rotation` only (advisory).
 *     The points are already rotated (they are the visual), so a lone
 *     `/Rotation` is inert for the AP generator (it ignores `/Rotation` with no
 *     `/UnrotatedRect`) — it just records the applied angle so EmbedPDF can
 *     reconstruct an oriented selection box + offer reset.
 *
 * A clear removes just its key via `EPDFAnnot_ClearEmbedMetadataKey`, never
 * the whole dict: identity fields UserID/GroupID/CreatedBy/UpdatedBy must
 * survive. Must run before `EPDFAnnot_GenerateAppearance` so the bake sees
 * the rotation. `/SchemaVersion` is seeded (stays 1) if this is the first key
 * in the dict.
 */

const KEY_ROTATION = 'Rotation';
const KEY_UNROTATED_RECT = 'UnrotatedRect';

/** A vertex kind's advisory turn. Tri-state: `undefined` preserves, `null` clears, a value sets. */
export interface AnnotationTransform {
  /** Degrees clockwise, the API's; stored counterclockwise. 0 ≡ none. */
  rotation?: number | null;
}

/** Seed `/SchemaVersion` when we are about to create the dict by writing the
 *  first transform key, so the marker readers look for is always present. */
function ensureSchemaVersion(fn: PdfFunctions, annotPtr: Ptr): void {
  if (!fn.EPDFAnnot_HasEmbedMetadata(annotPtr)) {
    fn.EPDFAnnot_SetEmbedMetadataNumber(annotPtr, 'SchemaVersion', EMBD_METADATA_SCHEMA_VERSION);
  }
}

function setRotation(fn: PdfFunctions, annotPtr: Ptr, rotation: number): void {
  ensureSchemaVersion(fn, annotPtr);
  fn.EPDFAnnot_SetEmbedMetadataNumber(annotPtr, KEY_ROTATION, pdfFromClockwise(rotation));
}

const QUARTER_TURNS = new Set([90, 180, 270]);

/**
 * Acrobat's own `/Rotate`, for the kinds Acrobat turns: a stamp at any angle,
 * a free text a quarter turn (a text box added on a turned page). Other angles
 * and kinds carry only our keys: Acrobat shows them turned (the turn is in the
 * drawing) and has no rotation of its own to keep. `null` removes it.
 */
function writeAcrobatRotate(fn: PdfFunctions, annotPtr: Ptr, rotation: number | null): void {
  const subtype = fn.FPDFAnnot_GetSubtype(annotPtr);
  const kept =
    rotation !== null &&
    (subtype === PdfAnnotationSubtypeCode.STAMP ||
      (subtype === PdfAnnotationSubtypeCode.FREETEXT && QUARTER_TURNS.has(rotation)));
  if (kept) {
    fn.EPDFAnnot_SetRotate(annotPtr, pdfFromClockwise(rotation));
  } else if (
    subtype === PdfAnnotationSubtypeCode.STAMP ||
    subtype === PdfAnnotationSubtypeCode.FREETEXT
  ) {
    fn.EPDFAnnot_SetRotate(annotPtr, 0);
  }
}

function setUnrotatedRect(
  fn: PdfFunctions,
  mem: PdfRuntimeMemory,
  annotPtr: Ptr,
  rect: PdfRect,
): void {
  ensureSchemaVersion(fn, annotPtr);
  const buf = mem.alloc(RECTF_BYTES);
  try {
    // FS_RECTF { left, top, right, bottom } — same layout as setAnnotRect.
    mem.poke(buf, 'f32', rect.left, 0);
    mem.poke(buf, 'f32', rect.top, 4);
    mem.poke(buf, 'f32', rect.right, 8);
    mem.poke(buf, 'f32', rect.bottom, 12);
    fn.EPDFAnnot_SetEmbedMetadataRect(annotPtr, KEY_UNROTATED_RECT, buf);
  } finally {
    mem.free(buf);
  }
}

/**
 * Record a box kind's turn in our keys, and in Acrobat's `/Rotate` for the
 * kinds Acrobat turns; `null` clears them.
 */
export function writeBoxTurn(
  fn: PdfFunctions,
  mem: PdfRuntimeMemory,
  annotPtr: Ptr,
  turn: AnnotationTurn | null,
): void {
  if (turn) {
    setRotation(fn, annotPtr, turn.rotation);
    setUnrotatedRect(fn, mem, annotPtr, turn.box);
  } else {
    fn.EPDFAnnot_ClearEmbedMetadataKey(annotPtr, KEY_ROTATION);
    fn.EPDFAnnot_ClearEmbedMetadataKey(annotPtr, KEY_UNROTATED_RECT);
  }
  writeAcrobatRotate(fn, annotPtr, turn?.rotation ?? null);
}

/**
 * Write the advisory `/Rotation` scalar for a vertex kind
 * (line/polyline/polygon/ink), tri-state: `undefined` never touches the
 * document, `null`/`0` clears, a value sets. Whenever it does write, any
 * `/UnrotatedRect` is defensively cleared — that key is an impossible state on
 * a vertex kind and must never accidentally drive the AP generator.
 */
export function writeVertexTransformMetadata(
  fn: PdfFunctions,
  annotPtr: Ptr,
  t: AnnotationTransform,
): void {
  if (t.rotation === undefined) return;
  if (t.rotation !== null && t.rotation !== 0) setRotation(fn, annotPtr, t.rotation);
  else fn.EPDFAnnot_ClearEmbedMetadataKey(annotPtr, KEY_ROTATION);
  fn.EPDFAnnot_ClearEmbedMetadataKey(annotPtr, KEY_UNROTATED_RECT);
}

/**
 * Before the engine redraws or re-places a box kind, our keys come to record
 * the turn it reads (`readAnnotationTurn`): a turn another app drew (a stamp
 * Acrobat turned, a text box Acrobat added on a turned page) is written, keys
 * another app left behind are rewritten or cleared. The generator and the
 * stamp placement read only our keys, so the drawing keeps what the page
 * showed; a stamp another app turned is then wrapped upright under our turn
 * by the re-fit. Acrobat's own `/Rotate` stays as the file has it.
 */
export function settleAnnotationTurn(fn: PdfFunctions, mem: PdfRuntimeMemory, annotPtr: Ptr): void {
  if (!isTurnableBoxKind(fn, annotPtr)) return;
  const turn = readAnnotationTurn(fn, mem, annotPtr);
  if (isSameAnnotationTurn(turn, readRecordedAnnotationTurn(fn, mem, annotPtr))) return;
  if (turn) {
    setRotation(fn, annotPtr, turn.rotation);
    setUnrotatedRect(fn, mem, annotPtr, turn.box);
  } else {
    fn.EPDFAnnot_ClearEmbedMetadataKey(annotPtr, KEY_ROTATION);
    fn.EPDFAnnot_ClearEmbedMetadataKey(annotPtr, KEY_UNROTATED_RECT);
  }
}
