import type { PdfDestination } from '@embedpdf/engine-core/runtime';
import type { PdfFunctions, PdfRuntimeMemory, Ptr } from '@embedpdf/engine-runtime';

import { withScratchN } from '../../../../runtime/memory/scratch';
import { F32_BYTES, I32_BYTES, readF32, readI32 } from '../../../../runtime/memory/structs';
import { DEST_VIEW } from '../destinationViewCodes';

const MAX_VIEW_PARAMS = 4; // /FitR carries the most: left, bottom, right, top

/**
 * Materialise one explicit `PdfDestination` from a live `destPtr`. PDFium
 * already resolved named destinations before handing us the pointer, so
 * only explicit arrays arrive here (the rule `PdfDestination` documents).
 *
 * Returns `null` when the destination is unreadable: no visible indirect page
 * in the document, or an unknown fit type. Coordinates stay raw PDF user
 * space — no conversion at this layer.
 *
 * Shared by the link reader today; the outline/bookmark port reuses it.
 */
export function readDestination(
  fn: PdfFunctions,
  mem: PdfRuntimeMemory,
  docPtr: Ptr,
  destPtr: Ptr,
): PdfDestination | null {
  const pageObjectNumber = fn.EPDFDest_GetPageObjectNumber(docPtr, destPtr);
  if (pageObjectNumber === 0) return null;

  const view = withScratchN(
    mem,
    [I32_BYTES, MAX_VIEW_PARAMS * F32_BYTES],
    ([countPtr, paramsPtr]) => {
      const code = fn.FPDFDest_GetView(destPtr, countPtr, paramsPtr);
      const count = Math.min(readI32(mem, countPtr), MAX_VIEW_PARAMS);
      const params: number[] = [];
      for (let i = 0; i < count; i++) params.push(readF32(mem, paramsPtr, i * F32_BYTES));
      return { code, params };
    },
  );
  const at = (i: number): number | null => (i < view.params.length ? view.params[i]! : null);

  switch (view.code) {
    case DEST_VIEW.xyz:
      return { kind: 'xyz', pageObjectNumber, ...readXyzLocation(fn, mem, destPtr) };
    case DEST_VIEW.fit:
      return { kind: 'fit', pageObjectNumber };
    case DEST_VIEW.fitH:
      return { kind: 'fitH', pageObjectNumber, top: at(0) };
    case DEST_VIEW.fitV:
      return { kind: 'fitV', pageObjectNumber, left: at(0) };
    case DEST_VIEW.fitR: {
      // /FitR is only meaningful with the full rect; a malformed one
      // degrades to the whole page rather than inventing coordinates.
      if (view.params.length < 4) return { kind: 'fit', pageObjectNumber };
      return {
        kind: 'fitR',
        pageObjectNumber,
        left: view.params[0]!,
        bottom: view.params[1]!,
        right: view.params[2]!,
        top: view.params[3]!,
      };
    }
    case DEST_VIEW.fitB:
      return { kind: 'fitB', pageObjectNumber };
    case DEST_VIEW.fitBH:
      return { kind: 'fitBH', pageObjectNumber, top: at(0) };
    case DEST_VIEW.fitBV:
      return { kind: 'fitBV', pageObjectNumber, left: at(0) };
    default:
      return null;
  }
}

/** `/XYZ` null-aware axes via `FPDFDest_GetLocationInPage` (FPDF_BOOL is 4 bytes). */
function readXyzLocation(
  fn: PdfFunctions,
  mem: PdfRuntimeMemory,
  destPtr: Ptr,
): { left: number | null; top: number | null; zoom: number | null } {
  return withScratchN(
    mem,
    [I32_BYTES, I32_BYTES, I32_BYTES, F32_BYTES, F32_BYTES, F32_BYTES],
    ([hasLeft, hasTop, hasZoom, left, top, zoom]) => {
      if (!fn.FPDFDest_GetLocationInPage(destPtr, hasLeft, hasTop, hasZoom, left, top, zoom)) {
        // Unreadable location: every axis "retains current" — still a valid /XYZ.
        return { left: null, top: null, zoom: null };
      }
      return {
        left: readI32(mem, hasLeft) ? readF32(mem, left) : null,
        top: readI32(mem, hasTop) ? readF32(mem, top) : null,
        zoom: readI32(mem, hasZoom) ? readF32(mem, zoom) : null,
      };
    },
  );
}
