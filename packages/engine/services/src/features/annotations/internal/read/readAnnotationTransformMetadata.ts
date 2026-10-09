import type { PdfFunctions, PdfRuntimeMemory, Ptr } from '@embedpdf/engine-runtime';

import { float32Decimal } from '../../../../runtime/memory/float32';
import { withScratch } from '../../../../runtime/memory/scratch';
import { F32_BYTES, readF32 } from '../../../../runtime/memory/structs';

/**
 * Read-side twin of `writers/.../writeAnnotationTransformMetadata.ts`. The API's
 * `rotation` is degrees clockwise; the file keeps PDF's counterclockwise angle
 * (`/EMBD_Metadata/Rotation`, Acrobat's `/Rotate`, an `/AP /Matrix`), so every
 * read converts here, once:
 *
 *   - box kinds (square/circle/free-text/stamp/caret) read what's drawn
 *     (`readAnnotationTurn.ts`), with the `box` the drawing turns;
 *   - vertex kinds (line/polyline/polygon/ink) read the advisory `Rotation`
 *     only: their points are the visual.
 *
 * An upright annotation reads neither, and the DTO fields stay `null`.
 */

const KEY_ROTATION = 'Rotation';

/**
 * A counterclockwise file angle (a float) as the API's clockwise one, in
 * [0, 360), as it was written: `33.3` reads `33.3`. `undefined` for none.
 */
export function clockwiseFromPdf(degrees: number): number | undefined {
  const clockwise = float32Decimal((((-float32Decimal(degrees) % 360) + 360) % 360) + 0);
  return clockwise === 0 || clockwise === 360 ? undefined : clockwise;
}

/** The API's clockwise angle as the file's counterclockwise one, in (-180, 180], as Acrobat writes it. */
export function pdfFromClockwise(degrees: number): number {
  const counterclockwise = (((-degrees % 360) + 360) % 360) + 0;
  return counterclockwise > 180 ? counterclockwise - 360 : counterclockwise;
}

/** A vertex kind's advisory rotation (degrees clockwise), or `undefined` when absent or zero. */
export function readAnnotationRotation(
  fn: PdfFunctions,
  mem: PdfRuntimeMemory,
  annotPtr: Ptr,
): number | undefined {
  if (!fn.EPDFAnnot_HasEmbedMetadata(annotPtr)) return undefined;
  return withScratch(mem, F32_BYTES, (buf) => {
    if (!fn.EPDFAnnot_GetEmbedMetadataNumber(annotPtr, KEY_ROTATION, buf)) return undefined;
    return clockwiseFromPdf(readF32(mem, buf));
  });
}
