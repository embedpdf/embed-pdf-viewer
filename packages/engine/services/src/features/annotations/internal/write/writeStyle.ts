import {
  type Color,
  type FilledStyleDraftFields,
  type GeometryStyleDraftFields,
} from '@embedpdf/engine-core/runtime';
import type { PdfFunctions, PdfRuntimeMemory, Ptr } from '@embedpdf/engine-runtime';

import { FPDFANNOT_COLORTYPE } from '../colorType';
import { readBorderStyle } from '../read/annotationReadPrimitives';
import { borderStyleFromCode, borderStyleToCode } from '../shapeBorderStyle';
import {
  clearAnnotColor,
  setAnnotColor,
  setAnnotOpacity,
  setBorderDashPattern,
  setBorderStyle,
} from './annotationWritePrimitives';

/** The `/BS` (border) subset shared by every kind that draws a border. */
export type BorderDraftFields = Pick<
  GeometryStyleDraftFields,
  'strokeWidth' | 'borderStyle' | 'dashArray'
>;

/**
 * Defaults applied when a draft omits a styling field. Shared by every
 * geometric family (shape/vertex/line/ink) so circle, square, polygon,
 * polyline, line, and ink all default to a 1pt solid red stroke.
 */
export const DEFAULT_OPACITY = 1;
export const DEFAULT_STROKE_WIDTH = 1;
export const DEFAULT_COLOR: Color = { r: 255, g: 0, b: 0 };

/**
 * Apply the geometry styling (`/C`, `/CA`, `/BS`, dash) from a draft to a
 * freshly-created annotation. This is the no-fill layer shared by ink and
 * the filled families; `interiorColor` (`/IC`) is layered on by
 * {@link applyFilledStyleDraft}. Geometry (`/Rect`, `/Vertices`, `/L`,
 * `/InkList`), cloudy borders, rect-differences, and line endings are
 * layered on by the family-specific writer around this call.
 */
export function applyGeometryStyleDraft(
  fn: PdfFunctions,
  mem: PdfRuntimeMemory,
  annotPtr: Ptr,
  draft: GeometryStyleDraftFields,
): void {
  setAnnotColor(fn, annotPtr, draft.color ?? DEFAULT_COLOR);
  setAnnotOpacity(fn, annotPtr, draft.opacity ?? DEFAULT_OPACITY);
  applyBorderDraft(fn, mem, annotPtr, draft);
}

/**
 * Write the `/BS` border (style + width, then dash) from a draft. This is
 * the border-only slice of {@link applyGeometryStyleDraft}, shared with the
 * free-text box border (which manages `/C` and `/DA` itself). A missing
 * `borderStyle`/`strokeWidth` falls back to a 1pt solid border.
 */
export function applyBorderDraft(
  fn: PdfFunctions,
  mem: PdfRuntimeMemory,
  annotPtr: Ptr,
  draft: BorderDraftFields,
): void {
  setBorderStyle(
    fn,
    annotPtr,
    borderStyleToCode(draft.borderStyle ?? 'solid'),
    draft.strokeWidth ?? DEFAULT_STROKE_WIDTH,
  );
  if (draft.dashArray !== undefined && draft.dashArray.length > 0) {
    setBorderDashPattern(fn, mem, annotPtr, draft.dashArray);
  }
}

/**
 * Apply the geometry styling from a patch to an existing annotation. Only
 * present fields are touched. Border style + width share the single
 * `EPDFAnnot_SetBorderStyle` call, so when only one is patched we read the
 * current pair first and preserve the other.
 */
export function applyGeometryStylePatch(
  fn: PdfFunctions,
  mem: PdfRuntimeMemory,
  annotPtr: Ptr,
  patch: GeometryStyleDraftFields,
): void {
  if (patch.color !== undefined) {
    setAnnotColor(fn, annotPtr, patch.color);
  }
  if (patch.opacity !== undefined) {
    setAnnotOpacity(fn, annotPtr, patch.opacity);
  }
  applyBorderPatch(fn, mem, annotPtr, patch);
}

/**
 * Write the `/BS` border from a patch, touching only present fields. Border
 * style + width share the single `EPDFAnnot_SetBorderStyle` call, so when
 * only one is patched we read the current pair first and preserve the other.
 * The border-only slice of {@link applyGeometryStylePatch}, shared with the
 * free-text box border.
 */
export function applyBorderPatch(
  fn: PdfFunctions,
  mem: PdfRuntimeMemory,
  annotPtr: Ptr,
  patch: BorderDraftFields,
): void {
  if (patch.borderStyle !== undefined || patch.strokeWidth !== undefined) {
    const current = readBorderStyle(fn, mem, annotPtr);
    const style = patch.borderStyle ?? borderStyleFromCode(current.styleCode);
    const width = patch.strokeWidth ?? current.width;
    setBorderStyle(fn, annotPtr, borderStyleToCode(style), width);
  }
  if (patch.dashArray !== undefined && patch.dashArray.length > 0) {
    setBorderDashPattern(fn, mem, annotPtr, patch.dashArray);
  }
}

/**
 * Apply the full stroke/fill styling (geometry styling + `/IC`) from a
 * draft. A `null`/omitted fill clears `/IC` so the shape renders unfilled.
 * Used by the filled families (circle/square/polygon/polyline/line).
 */
export function applyFilledStyleDraft(
  fn: PdfFunctions,
  mem: PdfRuntimeMemory,
  annotPtr: Ptr,
  draft: FilledStyleDraftFields,
): void {
  const interior = draft.interiorColor ?? null;
  if (interior === null) {
    clearAnnotColor(fn, annotPtr, FPDFANNOT_COLORTYPE.InteriorColor);
  } else {
    setAnnotColor(fn, annotPtr, interior, FPDFANNOT_COLORTYPE.InteriorColor);
  }
  applyGeometryStyleDraft(fn, mem, annotPtr, draft);
}

/**
 * Apply the full stroke/fill styling from a patch. Only present fields are
 * touched; `interiorColor: null` clears `/IC`.
 */
export function applyFilledStylePatch(
  fn: PdfFunctions,
  mem: PdfRuntimeMemory,
  annotPtr: Ptr,
  patch: FilledStyleDraftFields,
): void {
  if (patch.interiorColor !== undefined) {
    if (patch.interiorColor === null) {
      clearAnnotColor(fn, annotPtr, FPDFANNOT_COLORTYPE.InteriorColor);
    } else {
      setAnnotColor(fn, annotPtr, patch.interiorColor, FPDFANNOT_COLORTYPE.InteriorColor);
    }
  }
  applyGeometryStylePatch(fn, mem, annotPtr, patch);
}
