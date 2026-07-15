import type {
  AnnotationDTO,
  AnnotationListPageSnapshot,
  PageObjectNumber,
} from '@embedpdf/engine-core/runtime';
import type { PdfRuntimeModule, Ptr } from '@embedpdf/pdf-runtime';

import { pickReader } from './annotationReaderRegistry';
import { joinWidgetFieldNumbers } from './joinWidgetField';
import { readAnnotationBase } from './readAnnotationBase';
import type { DocumentSession } from '../../../../document-session/DocumentSession';
import { throwIfAborted } from '../../../../shared/abort';
import { ActionReadBudgetTracker } from '../../../actions/ActionModelReader';

/**
 * Shared per-page annotation read loop, used by both read paths. The raw
 * path (off `docPtr`, no `pagePtr`) and the full path (off an acquired
 * `pagePtr`) differ only in how they obtain the annotation count and each
 * `annotPtr`; everything after that — per-subtype dispatch, weak-flag
 * accounting, `pageState` decoration — is identical, so it lives here once.
 *
 * `getAnnotPtrAt(i)` returns the annotation handle at index `i`; this loop
 * always closes it via `FPDFPage_CloseAnnot`. The caller owns acquiring and
 * releasing any enclosing `pagePtr`.
 */
export function collectPageAnnotations(input: {
  runtime: PdfRuntimeModule;
  session: DocumentSession;
  pageObjectNumber: PageObjectNumber;
  count: number;
  getAnnotPtrAt: (index: number) => Ptr;
  signal: AbortSignal;
}): AnnotationListPageSnapshot {
  const { runtime, session, pageObjectNumber, count, getAnnotPtrAt, signal } = input;
  const { fn, mem } = runtime;

  const annotations: AnnotationDTO[] = [];
  let hasWeak = false;
  const revision = session.pageState(pageObjectNumber).revision;
  const actionBudget = new ActionReadBudgetTracker();

  for (let i = 0; i < count; i++) {
    throwIfAborted(signal);
    const annotPtr = getAnnotPtrAt(i);
    if (!annotPtr) continue;
    try {
      const base = readAnnotationBase(
        fn,
        mem,
        annotPtr,
        pageObjectNumber,
        i,
        revision,
        actionBudget,
      );
      const subtypeCode = fn.FPDFAnnot_GetSubtype(annotPtr);
      const { reader } = pickReader(subtypeCode);
      const dto = reader(fn, mem, annotPtr, base, subtypeCode);
      annotations.push(dto);
      if (dto.identityQuality === 'weak') hasWeak = true;
    } finally {
      fn.FPDFPage_CloseAnnot(annotPtr);
    }
  }

  joinWidgetFieldNumbers(runtime, session, annotations);
  session.recordWeakFlag(pageObjectNumber, hasWeak);
  return { pageState: session.pageState(pageObjectNumber), annotations };
}
