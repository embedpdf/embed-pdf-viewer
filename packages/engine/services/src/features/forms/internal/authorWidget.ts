import type { WidgetPlacement } from '@embedpdf/engine-core/runtime';
import { EngineError, EngineErrorCode } from '@embedpdf/engine-core/runtime';
import { NULL_PTR, type PdfRuntimeModule } from '@embedpdf/engine-runtime';

import type { DocumentSession } from '../../../document-session/DocumentSession';
import { setAnnotRect } from '../../annotations/internal/write/annotationWritePrimitives';
import { applyWidgetStyle } from '../../annotations/internal/write/writeWidgetAnnotation';

const WIDGET_SUBTYPE_CODE = 20; // FPDF_ANNOT_WIDGET

/**
 * Birth a widget through the annotation plane (EPDFPage_CreateAnnot -
 * indirect, durable object number), place it, and style it with THE
 * widget-plane writer (`applyWidgetStyle` - the same code the widget
 * annotation kind uses for create/patch). Returns the widget's object
 * number, ready for EPDFForm_AttachWidget adoption.
 */
export function createUnattachedWidget(
  runtime: PdfRuntimeModule,
  session: DocumentSession,
  placement: WidgetPlacement,
): number {
  const { fn, mem } = runtime;
  const pool = session.pagePool();
  const pagePtr = pool.acquire(placement.pageObjectNumber);
  try {
    const annotPtr = fn.EPDFPage_CreateAnnot(pagePtr, WIDGET_SUBTYPE_CODE);
    if (annotPtr === NULL_PTR) {
      throw new EngineError(EngineErrorCode.Unknown, 'failed to create widget annotation');
    }
    try {
      setAnnotRect(fn, mem, annotPtr, placement.rect);
      if (placement.appearance) {
        applyWidgetStyle(fn, mem, annotPtr, placement.appearance);
      }
      const widgetObjectNumber = fn.EPDFAnnot_GetObjectNumber(annotPtr);
      if (widgetObjectNumber <= 0) {
        throw new EngineError(EngineErrorCode.Unknown, 'widget annotation has no object number');
      }
      return widgetObjectNumber;
    } finally {
      fn.FPDFPage_CloseAnnot(annotPtr);
    }
  } finally {
    pool.release(placement.pageObjectNumber);
  }
}
