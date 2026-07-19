import type {
  AnnotationBorderStyle,
  Color,
  FilledStyleFields,
  GeometryStyleFields,
} from '@embedpdf/engine-core/runtime';
import type { PdfFunctions, PdfRuntimeMemory, Ptr } from '@embedpdf/engine-runtime';

import { FPDFANNOT_COLORTYPE } from '../colorType';
import { borderStyleFromCode } from '../shapeBorderStyle';
import {
  readAnnotColor,
  readAnnotOpacity,
  readBorderDashPattern,
  readBorderStyle,
} from './annotationReadPrimitives';

/**
 * Default `/C` colour when an annotation has none. Matches the v2 engine
 * (circle/square/polygon/polyline/line/ink all default red).
 */
const DEFAULT_COLOR: Color = { r: 255, g: 0, b: 0 };

/** The `/BS` border fields shared by every kind that draws a border. */
export interface BorderFields {
  strokeWidth: number;
  borderStyle: AnnotationBorderStyle;
  dashArray?: number[];
}

/**
 * Shared reader for the `/BS` border (style + width + dash). The border-only
 * slice of {@link readGeometryStyleExtras}, reused by the free-text box
 * border (which reads `/C` and `/DA` itself).
 */
export function readBorderFields(
  fn: PdfFunctions,
  mem: PdfRuntimeMemory,
  annotPtr: Ptr,
): BorderFields {
  const { styleCode, width } = readBorderStyle(fn, mem, annotPtr);
  const dashArray = readBorderDashPattern(fn, mem, annotPtr);
  return {
    strokeWidth: width,
    borderStyle: borderStyleFromCode(styleCode),
    ...(dashArray.length > 0 ? { dashArray } : {}),
  };
}

/**
 * Shared reader for the geometry styling (`/C`, `/CA`, `/BS`, dash) — the
 * no-fill layer shared by ink and the filled families. Family readers layer
 * their own geometry + extras on top; filled families add `/IC` via
 * {@link readFilledStyleExtras}.
 */
export function readGeometryStyleExtras(
  fn: PdfFunctions,
  mem: PdfRuntimeMemory,
  annotPtr: Ptr,
): GeometryStyleFields {
  const color = readAnnotColor(fn, mem, annotPtr, FPDFANNOT_COLORTYPE.Color) ?? {
    ...DEFAULT_COLOR,
  };
  const ca = readAnnotOpacity(fn, mem, annotPtr);
  const opacity = ca == null ? 1 : Math.max(0, Math.min(1, ca));

  return {
    color,
    opacity,
    ...readBorderFields(fn, mem, annotPtr),
  };
}

/**
 * Shared reader for the full stroke/fill styling (geometry styling + `/IC`).
 * Reused by every filled family (shape/vertex/line); each layers its own
 * geometry + extras on top.
 */
export function readFilledStyleExtras(
  fn: PdfFunctions,
  mem: PdfRuntimeMemory,
  annotPtr: Ptr,
): FilledStyleFields {
  const interiorColor = readAnnotColor(fn, mem, annotPtr, FPDFANNOT_COLORTYPE.InteriorColor);
  return {
    ...readGeometryStyleExtras(fn, mem, annotPtr),
    interiorColor: interiorColor ?? null,
  };
}
