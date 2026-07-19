import type { PdfRect } from '@embedpdf/engine-core/runtime';
import type { PdfFunctions, PdfRuntimeMemory, Ptr } from '@embedpdf/engine-runtime';

import { withScratch } from '../../../../runtime/memory/scratch';
import { F32_BYTES, RECTF_BYTES, readF32, readRectF } from '../../../../runtime/memory/structs';

/**
 * Read-side twin of `writers/.../writeAnnotationTransformMetadata.ts`. Decodes
 * the EmbedPDF rotation keys from /EMBD_Metadata back onto the DTO:
 *
 *   - `Rotation`      — degrees, PDF convention. Returned for EVERY rotatable
 *     kind (box AND vertex); the plugin converts it back to its CW-content
 *     `rot` once at the repository seam.
 *   - `UnrotatedRect` — the logical box. BOX kinds only (square/circle/
 *     free-text); a vertex annotation never carries one (its points are the
 *     visual), so vertex readers don't ask for it.
 *
 * Both are absent on un-rotated annotations (and on everything authored before
 * rotation shipped), so both reads return `undefined` and the DTO field stays
 * unset.
 */

const KEY_ROTATION = 'Rotation';
const KEY_UNROTATED_RECT = 'UnrotatedRect';

/** The advisory/portable rotation scalar (degrees, PDF convention), or
 *  `undefined` when absent or zero. */
export function readAnnotationRotation(
  fn: PdfFunctions,
  mem: PdfRuntimeMemory,
  annotPtr: Ptr,
): number | undefined {
  if (!fn.EPDFAnnot_HasEmbedMetadata(annotPtr)) return undefined;
  return withScratch(mem, F32_BYTES, (buf) => {
    if (!fn.EPDFAnnot_GetEmbedMetadataNumber(annotPtr, KEY_ROTATION, buf)) return undefined;
    const v = readF32(mem, buf);
    return v ? v : undefined; // 0 ≡ "no rotation"
  });
}

/** The logical (unrotated) box of a rotated BOX annotation, or `undefined`. */
export function readAnnotationUnrotatedRect(
  fn: PdfFunctions,
  mem: PdfRuntimeMemory,
  annotPtr: Ptr,
): PdfRect | undefined {
  if (!fn.EPDFAnnot_HasEmbedMetadata(annotPtr)) return undefined;
  return withScratch(mem, RECTF_BYTES, (buf) => {
    if (!fn.EPDFAnnot_GetEmbedMetadataRect(annotPtr, KEY_UNROTATED_RECT, buf)) return undefined;
    // FS_RECTF { left, top, right, bottom } → wire-stable PdfRect.
    const r = readRectF(mem, buf);
    return { left: r.left, bottom: r.bottom, right: r.right, top: r.top };
  });
}
