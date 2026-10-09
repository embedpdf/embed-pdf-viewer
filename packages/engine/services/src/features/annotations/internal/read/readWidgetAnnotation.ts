import type {
  AnnotationBase,
  Color,
  WidgetAnnotation,
  PdfCoordinates,
  PdfRotation,
} from '@embedpdf/engine-core/runtime';
import { colorOf, pdfQuarterTurnBox, quarterTurnOf } from '@embedpdf/engine-core/runtime';
import { type PdfFunctions, type PdfRuntimeMemory, type Ptr } from '@embedpdf/engine-runtime';

import { withScratchN } from '../../../../runtime/memory/scratch';
import { readUtf16String } from '../../../../runtime/memory/strings';
import { readI32 } from '../../../../runtime/memory/structs';
import { standardFontFromCode } from '../standardFont';
import { textAlignmentFromCode } from '../textAlignment';
import { readDefaultAppearance, readTextAlignment } from './annotationReadPrimitives';
import { readBorderFields } from './readStyle';

const MK_BORDER_COLOR = 0; // EPDF_MK_COLOR_BC
const MK_BACKGROUND_COLOR = 1; // EPDF_MK_COLOR_BG
const MK_CAPTION = 0; // EPDF_MK_TEXT_CA
const I32_BYTES = 4;

function readMKColor(
  fn: PdfFunctions,
  mem: PdfRuntimeMemory,
  annotPtr: Ptr,
  which: number,
): Color | null {
  return withScratchN(mem, [I32_BYTES, I32_BYTES, I32_BYTES], ([r, g, b]) => {
    if (!fn.EPDFAnnot_GetMKColor(annotPtr, which, r, g, b)) return null;
    return colorOf(readI32(mem, r) & 0xff, readI32(mem, g) & 0xff, readI32(mem, b) & 0xff);
  });
}

/**
 * A widget's turn: `/MK /R`, which the file holds counterclockwise, as the
 * clockwise quarter turn the API reads; `null` upright. A value that isn't
 * a quarter turn reads upright, as the appearance generator draws it.
 */
export function readWidgetTurn(fn: PdfFunctions, annotPtr: Ptr): PdfRotation | null {
  return quarterTurnOf(-fn.EPDFAnnot_GetMKRotation(annotPtr)) || null;
}

/**
 * Widget-plane read: /MK colours, /BS border, /DA text defaults, /Q, the
 * turn (/MK /R) with the box it turns, and the field join. Field-plane
 * data (value, options, flags) lives on `doc.forms` — join via `field`,
 * the field's ref.
 */
export function readWidget(
  fn: PdfFunctions,
  mem: PdfRuntimeMemory,
  annotPtr: Ptr,
  base: AnnotationBase<PdfCoordinates>,
): WidgetAnnotation<PdfCoordinates> {
  const border = readBorderFields(fn, mem, annotPtr);
  const da = readDefaultAppearance(fn, mem, annotPtr);
  const rotation = readWidgetTurn(fn, annotPtr);
  return {
    ...base,
    // `/Rect` is where the widget stands: its box, turned.
    box: pdfQuarterTurnBox(base.rect, rotation ?? 0),
    rotation,
    // Who made and filled a widget is its field's to say: a field merged
    // with its widget shares one /EMBD_Metadata, and a key never means two
    // things. The row reports no attribution of its own.
    groupId: null,
    userId: null,
    createdBy: null,
    modifiedBy: null,
    importedBy: null,
    subtype: 'widget',
    color: readMKColor(fn, mem, annotPtr, MK_BORDER_COLOR),
    interiorColor: readMKColor(fn, mem, annotPtr, MK_BACKGROUND_COLOR),
    strokeWidth: border.strokeWidth,
    borderStyle: border.borderStyle,
    fontFamily: da ? standardFontFromCode(da.fontCode) : null,
    fontSize: da ? da.fontSize : null,
    fontColor: da ? da.color : null,
    textAlign: textAlignmentFromCode(readTextAlignment(fn, annotPtr)),
    // `/MK /CA` as stored; the field join keeps it on a push button's widget only.
    caption: readUtf16String(mem, (buf, capacity) =>
      fn.EPDFAnnot_GetMKText(annotPtr, MK_CAPTION, buf, capacity),
    ),
    // Joined by the caller (joinWidgetFieldNumbers): the /Parent target is
    // a field dictionary, which annotation-plane primitives cannot follow.
    field: null,
    fieldFamily: 'unknown',
  };
}
