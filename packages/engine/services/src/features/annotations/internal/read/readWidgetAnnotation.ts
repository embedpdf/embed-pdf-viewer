import type { AnnotationBase, Color, WidgetAnnotationDTO } from '@embedpdf/engine-core/runtime';
import { type PdfFunctions, type PdfRuntimeMemory, type Ptr } from '@embedpdf/engine-runtime';

import { withScratchN } from '../../../../runtime/memory/scratch';
import { readI32 } from '../../../../runtime/memory/structs';
import { standardFontFromCode } from '../standardFont';
import { textAlignmentFromCode } from '../textAlignment';
import { readDefaultAppearance, readTextAlignment } from './annotationReadPrimitives';
import { readBorderFields } from './readStyle';

const MK_BORDER_COLOR = 0; // EPDF_MK_COLOR_BC
const MK_BACKGROUND_COLOR = 1; // EPDF_MK_COLOR_BG
const I32_BYTES = 4;

function readMKColor(
  fn: PdfFunctions,
  mem: PdfRuntimeMemory,
  annotPtr: Ptr,
  which: number,
): Color | null {
  return withScratchN(mem, [I32_BYTES, I32_BYTES, I32_BYTES], ([r, g, b]) => {
    if (!fn.EPDFAnnot_GetMKColor(annotPtr, which, r, g, b)) return null;
    return {
      r: readI32(mem, r) & 0xff,
      g: readI32(mem, g) & 0xff,
      b: readI32(mem, b) & 0xff,
    };
  });
}

/**
 * Widget-plane read: /MK colours, /BS border, /DA text defaults, /Q, and
 * the field join. Field-plane data (value, options, flags) lives on
 * `doc.forms` — join via `fieldObjectNumber`.
 */
export function readWidget(
  fn: PdfFunctions,
  mem: PdfRuntimeMemory,
  annotPtr: Ptr,
  base: AnnotationBase,
): WidgetAnnotationDTO {
  const border = readBorderFields(fn, mem, annotPtr);
  const da = readDefaultAppearance(fn, mem, annotPtr);
  return {
    ...base,
    subtype: 'widget',
    color: readMKColor(fn, mem, annotPtr, MK_BORDER_COLOR),
    interiorColor: readMKColor(fn, mem, annotPtr, MK_BACKGROUND_COLOR),
    strokeWidth: border.strokeWidth,
    borderStyle: border.borderStyle,
    ...(da
      ? {
          fontFamily: standardFontFromCode(da.fontCode),
          fontSize: da.fontSize,
          fontColor: da.color,
        }
      : {}),
    textAlign: textAlignmentFromCode(readTextAlignment(fn, annotPtr)),
    // Joined by the caller (joinWidgetFieldNumbers): the /Parent target is
    // a FIELD dictionary, which annotation-plane primitives cannot follow.
    fieldObjectNumber: 0,
    fieldFamily: 'unknown',
  };
}
