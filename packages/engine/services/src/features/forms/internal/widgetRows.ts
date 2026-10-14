import {
  EngineError,
  EngineErrorCode,
  type FormMutationMeta,
  type FormSnapshot,
  type FormWidget,
  type FormWidgetRows,
  type PdfCoordinates,
  type WidgetAnnotation,
} from '@embedpdf/engine-core/runtime';
import type { PdfRuntimeModule } from '@embedpdf/engine-runtime';

import type { DocumentSession } from '../../../document-session/DocumentSession';
import { throwIfAborted } from '../../../shared/abort';
import {
  openAnnotAtRaw,
  resolveAnnotIndexRaw,
} from '../../annotations/internal/identity/resolveAnnotIndexRaw';
import { readContextFor } from '../../annotations/internal/read/annotationReadContext';
import { joinWidgetFieldNumbers } from '../../annotations/internal/read/joinWidgetField';
import { readAnnotationFromPtr } from '../../annotations/internal/read/readAnnotationFromPtr';
import { collectPageAnnotations } from '../../annotations/internal/read/collectPageAnnotations';
import type { FontRegistrar } from '../../fonts/FontRegistrar';
import { acquireFormModel } from './formModelCache';
import { readFormFields } from './readFormSnapshot';

/**
 * The whole form, as `doc.forms.list()` returns it: the fields from the
 * native model, and every widget row from the pages.
 */
export function readForm(
  runtime: PdfRuntimeModule,
  session: DocumentSession,
  signal: AbortSignal,
  fonts?: FontRegistrar,
): FormSnapshot<PdfCoordinates> {
  const model = acquireFormModel(runtime, session);
  const { formKind, needsAppearances, fields, calculationOrder } = readFormFields(
    runtime,
    model,
    session.requireDocPtr(),
  );
  const widgets = readFormWidgets(runtime, session, signal, fonts);
  return { formKind, needsAppearances, fields, widgets, calculationOrder };
}

/**
 * Every widget the document's pages show, in page order and `/Annots` order
 * within a page: the form's rows. Each page's `/Annots` decides where a
 * widget is, as it does for every reader. Only widget rows are built: an
 * other annotation's subtype is read, never its row. A page stored inline
 * has no object number, so nothing on it can be named: it is passed over,
 * and the rest of the form still reads.
 */
export function readFormWidgets(
  runtime: PdfRuntimeModule,
  session: DocumentSession,
  signal: AbortSignal,
  fonts?: FontRegistrar,
): WidgetAnnotation<PdfCoordinates>[] {
  const { fn } = runtime;
  const docPtr = session.requireDocPtr();
  const rows: WidgetAnnotation<PdfCoordinates>[] = [];
  const pageCount = fn.FPDF_GetPageCount(docPtr);
  for (let pageIndex = 0; pageIndex < pageCount; pageIndex++) {
    throwIfAborted(signal);
    const pageObjectNumber = fn.EPDFDoc_GetPageObjectNumberByIndex(docPtr, pageIndex);
    if (pageObjectNumber <= 0) continue;
    const count = fn.EPDFPage_GetAnnotCountRaw(docPtr, pageIndex);
    if (count <= 0) continue;
    const { annotations } = collectPageAnnotations({
      runtime,
      session,
      pageObjectNumber,
      count,
      getAnnotPtrAt: (i) => fn.EPDFPage_GetAnnotRaw(docPtr, pageIndex, i),
      signal,
      family: 'widgets',
      ...(fonts ? { fonts } : {}),
    });
    rows.push(...(annotations as WidgetAnnotation<PdfCoordinates>[]));
  }
  return rows;
}

/**
 * The rows of `widgets`, each read by its object number on its page: a form
 * write's answer. A widget no page shows any more (deleted with its field)
 * has no row.
 */
export function readWidgetRows(
  runtime: PdfRuntimeModule,
  session: DocumentSession,
  widgets: readonly FormWidget[],
  fonts?: FontRegistrar,
): WidgetAnnotation<PdfCoordinates>[] {
  const { fn, mem } = runtime;
  const rows: WidgetAnnotation<PdfCoordinates>[] = [];
  const seen = new Set<number>();
  for (const widget of widgets) {
    if (!widget.ref || seen.has(widget.objectNumber)) continue;
    seen.add(widget.objectNumber);
    const at = tryResolve(runtime, session, widget);
    if (!at) continue;
    const annotPtr = openAnnotAtRaw(runtime, session, at.pageIndex, at.index);
    try {
      const row = readAnnotationFromPtr(
        fn,
        mem,
        annotPtr,
        widget.ref.page.objectNumber,
        at.index,
        readContextFor(session, fonts),
      );
      if (row.subtype === 'widget') rows.push(row);
    } finally {
      fn.FPDFPage_CloseAnnot(annotPtr);
    }
  }
  joinWidgetFieldNumbers(runtime, session, rows);
  return rows;
}

/** `result` with the rows of the widgets its meta names. */
export function withWidgetRows<T extends { meta: FormMutationMeta }>(
  runtime: PdfRuntimeModule,
  session: DocumentSession,
  result: T,
  fonts?: FontRegistrar,
): T & FormWidgetRows<PdfCoordinates> {
  return {
    ...result,
    widgets: readWidgetRows(runtime, session, result.meta.changedWidgets, fonts),
  };
}

function tryResolve(
  runtime: PdfRuntimeModule,
  session: DocumentSession,
  widget: FormWidget,
): { pageIndex: number; index: number } | null {
  try {
    return resolveAnnotIndexRaw(runtime, session, widget.ref!);
  } catch (error) {
    if (EngineError.is(error) && error.code === EngineErrorCode.NotFound) return null;
    throw error;
  }
}
