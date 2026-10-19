import type {
  Annotation,
  AnnotationFamily,
  AnnotationList,
  PageObjectNumber,
  PdfCoordinates,
} from '@embedpdf/engine-core/runtime';
import { toPageRef } from '@embedpdf/engine-core/runtime';
import type { PdfRuntimeModule, Ptr } from '@embedpdf/engine-runtime';

import { readContextFor } from './annotationReadContext';
import { pickReader } from './annotationReaderRegistry';
import { joinWidgetFieldNumbers } from './joinWidgetField';
import { familyOfCode } from '../familyOfCode';
import { readAnnotationBase } from './readAnnotationBase';
import type { DocumentSession } from '../../../../document-session/DocumentSession';
import { throwIfAborted } from '../../../../shared/abort';
import { ActionReadBudgetTracker } from '../../../actions/ActionModelReader';
import type { FontRegistrar } from '../../../fonts/FontRegistrar';

/**
 * Shared per-page annotation read loop, used by both read paths. The raw
 * path (off `docPtr`, no `pagePtr`) and the full path (off an acquired
 * `pagePtr`) differ only in how they obtain the annotation count and each
 * `annotPtr`; everything after that — naming, per-subtype dispatch — is
 * identical, so it lives here once.
 *
 * `getAnnotPtrAt(i)` returns the annotation handle at index `i`; this loop
 * always closes it via `FPDFPage_CloseAnnot`. The caller owns acquiring and
 * releasing any enclosing `pagePtr`.
 *
 * With `family`, only that family's rows are built: the subtype is checked
 * before anything else is read, so a form read never builds a comment's row
 * and an annotation read never builds a widget's.
 */
export function collectPageAnnotations(input: {
  runtime: PdfRuntimeModule;
  session: DocumentSession;
  pageObjectNumber: PageObjectNumber;
  count: number;
  getAnnotPtrAt: (index: number) => Ptr;
  signal: AbortSignal;
  fonts?: FontRegistrar;
  /** Build only this family's rows; every row without it. */
  family?: AnnotationFamily;
}): AnnotationList<PdfCoordinates> {
  const { runtime, session, pageObjectNumber, count, getAnnotPtrAt, signal, fonts, family } = input;
  const { fn, mem } = runtime;

  const annotations: Annotation<PdfCoordinates>[] = [];
  const actionBudget = new ActionReadBudgetTracker();
  const readCtx = readContextFor(session, fonts);

  for (let i = 0; i < count; i++) {
    throwIfAborted(signal);
    const annotPtr = getAnnotPtrAt(i);
    if (!annotPtr) continue;
    try {
      const subtypeCode = fn.FPDFAnnot_GetSubtype(annotPtr);
      if (family && familyOfCode(subtypeCode) !== family) continue;
      const base = readAnnotationBase(
        fn,
        mem,
        readCtx.docPtr,
        annotPtr,
        pageObjectNumber,
        i,
        actionBudget,
      );
      const { reader } = pickReader(subtypeCode);
      const dto = reader(fn, mem, annotPtr, base, subtypeCode, readCtx);
      annotations.push(dto);
    } finally {
      fn.FPDFPage_CloseAnnot(annotPtr);
    }
  }

  joinWidgetFieldNumbers(runtime, session, annotations);
  return { annotations, pages: [toPageRef(pageObjectNumber)] };
}
