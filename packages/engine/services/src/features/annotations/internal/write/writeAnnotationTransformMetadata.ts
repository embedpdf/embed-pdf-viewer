import { EngineError, EngineErrorCode, type PdfRect } from '@embedpdf/engine-core/runtime';
import type { PdfFunctions, PdfRuntimeMemory, Ptr } from '@embedpdf/engine-runtime';

import { RECTF_BYTES } from '../../../../runtime/memory/structs';
import { readAnnotationUnrotatedRect } from '../read/readAnnotationTransformMetadata';
import { EMBD_METADATA_SCHEMA_VERSION } from './writeEmbedMetadata';

/**
 * Write the EmbedPDF transform keys under /EMBD_Metadata. This is the seam
 * PDFium's native AP generator reads to bake a ROTATED appearance:
 *
 *   /EMBD_Metadata <<
 *     /Rotation      45                    % degrees, PDF convention (CCW)
 *     /UnrotatedRect [x0 y0 x1 y1]         % BOX kinds only — the logical box
 *   >>
 *
 * The family split (see the v3 plan):
 *   - BOX kinds (square/circle/free-text): `/Rotation` + `/UnrotatedRect`.
 *     With BOTH present the AP generator emits an `/AP /Matrix` that rotates a
 *     box-sized appearance about the box centre, and `/Rect` is the enclosing
 *     AABB. This is the portable, externally-correct rotation.
 *   - VERTEX kinds (line/polyline/polygon/ink): `/Rotation` ONLY (advisory).
 *     The points are already rotated (they are the visual), so a lone
 *     `/Rotation` is INERT for the AP generator (it ignores `/Rotation` with no
 *     `/UnrotatedRect`) — it just records the applied angle so EmbedPDF can
 *     reconstruct an oriented selection box + offer reset.
 *
 * Both fields follow the engine-wide tri-state law ("a patch touches what it
 * states, preserves what it omits"):
 *   - `undefined` → the key is UNTOUCHED (a rect-only move keeps its rotation).
 *   - `null` or `0` → CLEAR just that key via `EPDFAnnot_ClearEmbedMetadataKey`
 *     (0 ≡ no rotation is the canonical identity, not a sentinel; never clear
 *     the whole dict — identity fields UserID/GroupID/CreatedBy/UpdatedBy must
 *     survive).
 *   - a value → SET the key. Setting a nonzero rotation with no
 *     `/UnrotatedRect` (neither in the patch nor already on the annotation)
 *     is an unsatisfiable state for the AP generator and throws `InvalidArg`.
 *
 * MUST run BEFORE `EPDFAnnot_GenerateAppearance` so the bake sees the rotation.
 * `/SchemaVersion` is seeded (stays 1) if this is the first key in the dict.
 */

const KEY_ROTATION = 'Rotation';
const KEY_UNROTATED_RECT = 'UnrotatedRect';

/** Transform fields a rotatable draft/patch can carry (off the engine DTO).
 *  Tri-state: `undefined` preserves, `null` clears, a value sets. */
export interface AnnotationTransform {
  /** `/EMBD_Metadata/Rotation` — degrees, PDF convention. 0 ≡ none. */
  rotation?: number | null;
  /** `/EMBD_Metadata/UnrotatedRect` — the logical box (BOX kinds only). */
  unrotatedRect?: PdfRect | null;
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
  fn.EPDFAnnot_SetEmbedMetadataNumber(annotPtr, KEY_ROTATION, rotation);
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
 * Write transform metadata for a BOX kind (square/circle/free-text/stamp),
 * tri-state per field: `undefined` never touches the document (safe to call on
 * every patch), `null`/`0` clears, a value sets. A nonzero rotation with no
 * unrotated box anywhere (patch or annotation) is unsatisfiable — the AP
 * generator needs the pair — and throws instead of writing a broken state.
 */
export function writeBoxTransformMetadata(
  fn: PdfFunctions,
  mem: PdfRuntimeMemory,
  annotPtr: Ptr,
  t: AnnotationTransform,
): void {
  if (t.rotation !== undefined) {
    if (t.rotation !== null && t.rotation !== 0) {
      const hasBox =
        t.unrotatedRect != null ||
        (t.unrotatedRect === undefined && readAnnotationUnrotatedRect(fn, mem, annotPtr) != null);
      if (!hasBox) {
        throw new EngineError(
          EngineErrorCode.InvalidArg,
          'rotation requires unrotatedRect: supply the pair together (or rely on an existing /EMBD_Metadata/UnrotatedRect)',
        );
      }
      setRotation(fn, annotPtr, t.rotation);
    } else {
      fn.EPDFAnnot_ClearEmbedMetadataKey(annotPtr, KEY_ROTATION);
    }
  }
  if (t.unrotatedRect !== undefined) {
    if (t.unrotatedRect !== null) setUnrotatedRect(fn, mem, annotPtr, t.unrotatedRect);
    else fn.EPDFAnnot_ClearEmbedMetadataKey(annotPtr, KEY_UNROTATED_RECT);
  }
}

/**
 * Write the advisory `/Rotation` scalar for a VERTEX kind
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
