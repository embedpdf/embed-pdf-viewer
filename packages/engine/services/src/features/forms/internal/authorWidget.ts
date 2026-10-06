import type { PdfCoordinates, WidgetPlacement } from '@embedpdf/engine-core/runtime';
import { EngineError, EngineErrorCode, generateUuidV7 } from '@embedpdf/engine-core/runtime';
import { NULL_PTR, type PdfRuntimeModule, type Ptr } from '@embedpdf/engine-runtime';

import { objectNumberUnavailable } from '../../../document-session/DocumentSession';
import {
  setAnnotRect,
  writeAnnotString,
} from '../../annotations/internal/write/annotationWritePrimitives';
import { applyWidgetStyle } from '../../annotations/internal/write/writeWidgetAnnotation';

const WIDGET_SUBTYPE_CODE = 20; // FPDF_ANNOT_WIDGET

/**
 * Birth a widget through the annotation plane (EPDFPage_CreateAnnotRaw -
 * indirect, durable object number, no page load), place it, and style it
 * with the placement's style fields through the widget-plane writer
 * (`applyWidgetStyle` - the same code the widget annotation kind uses for
 * create/patch). Like every annotation the engine makes, it gets a fresh
 * UUIDv7 `/NM`. Returns the widget's object number (`objectNumber`, which
 * the session checked, or the next free one), ready for
 * EPDFForm_AttachWidget adoption.
 */
export function createUnattachedWidget(
  runtime: PdfRuntimeModule,
  docPtr: Ptr,
  pageIndex: number,
  placement: WidgetPlacement<PdfCoordinates>,
  objectNumber?: number,
): number {
  const { fn, mem } = runtime;
  const annotPtr = fn.EPDFPage_CreateAnnotRaw(
    docPtr,
    pageIndex,
    WIDGET_SUBTYPE_CODE,
    objectNumber ?? 0, // 0: the next free one
  );
  if (annotPtr === NULL_PTR && objectNumber !== undefined) {
    throw objectNumberUnavailable(objectNumber, 'taken');
  }
  if (annotPtr === NULL_PTR) {
    throw new EngineError(EngineErrorCode.Unknown, 'failed to create widget annotation');
  }
  try {
    writeAnnotString(fn, mem, annotPtr, 'NM', generateUuidV7());
    const { page: _page, rect, exportValue: _exportValue, ...style } = placement;
    setAnnotRect(fn, mem, annotPtr, rect);
    if (Object.keys(style).length > 0) applyWidgetStyle(fn, mem, annotPtr, style);
    const widgetObjectNumber = fn.EPDFAnnot_GetObjectNumber(annotPtr);
    if (widgetObjectNumber <= 0) {
      throw new EngineError(EngineErrorCode.Unknown, 'widget annotation has no object number');
    }
    return widgetObjectNumber;
  } finally {
    fn.FPDFPage_CloseAnnot(annotPtr);
  }
}
