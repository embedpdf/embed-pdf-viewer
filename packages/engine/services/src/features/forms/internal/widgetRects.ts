import type { PdfRect } from '@embedpdf/engine-core/runtime';
import { normalizePdfRect } from '@embedpdf/engine-core/runtime';
import type { PdfRuntimeModule, Ptr } from '@embedpdf/engine-runtime';

import { withScratch } from '../../../runtime/memory/scratch';
import { RECTF_BYTES, readRectF } from '../../../runtime/memory/structs';

/** A lookup of a widget's /Rect by its object number; `null` for one in no field. */
export type WidgetRectOf = (widgetObjectNumber: number) => PdfRect | null;

/** A widget's /Rect, found through the form model that lists it. */
export function formWidgetRect(
  runtime: PdfRuntimeModule,
  formModel: Ptr,
  widgetObjectNumber: number,
): PdfRect | null {
  const { fn, mem } = runtime;
  const fieldIndex = fn.EPDFForm_GetFieldIndexForWidget(formModel, widgetObjectNumber);
  if (fieldIndex < 0) return null;
  const count = fn.EPDFForm_CountFieldWidgets(formModel, fieldIndex);
  for (let w = 0; w < count; w++) {
    if (fn.EPDFForm_GetFieldWidgetObjNum(formModel, fieldIndex, w) !== widgetObjectNumber) continue;
    return withScratch(mem, RECTF_BYTES, (buf) =>
      fn.EPDFForm_GetFieldWidgetRect(formModel, fieldIndex, w, buf)
        ? normalizePdfRect(readRectF(mem, buf))
        : null,
    );
  }
  return null;
}

/** Run `read` with a widget rect lookup on `docPtr`'s form, its model closed after. */
export function withWidgetRects<T>(
  runtime: PdfRuntimeModule,
  docPtr: Ptr,
  read: (rectOf: WidgetRectOf) => T,
): T {
  const { fn } = runtime;
  const formModel = fn.EPDFForm_LoadModel(docPtr);
  if (!formModel) return read(() => null);
  try {
    return read((widgetObjectNumber) => formWidgetRect(runtime, formModel, widgetObjectNumber));
  } finally {
    fn.EPDFForm_CloseModel(formModel);
  }
}
