import {
  EngineError,
  EngineErrorCode,
  type AnnotationRef,
  type FormFieldWidget,
} from '@embedpdf/engine-core/runtime';
import type { PdfRuntimeModule, Ptr } from '@embedpdf/engine-runtime';

import type { DocumentSession } from '../../../document-session/DocumentSession';
import { openAnnotRaw } from '../../annotations/internal/identity/resolveAnnotIndexRaw';

/** `EPDF_MK_ICON_I`: a push button's normal icon, the one its appearance draws. */
export const MK_ICON_NORMAL = 0;

/**
 * Page indexes by page object number, for reading widgets raw from a field
 * read, which has the document and no session: the page list is read once,
 * on the first lookup, and only then. One lookup serves a whole read of the
 * form.
 */
export class PageIndexLookup {
  private indexes: Map<number, number> | null = null;

  constructor(
    private readonly runtime: PdfRuntimeModule,
    private readonly docPtr: Ptr,
  ) {}

  /** The index of the page whose object number this is, or -1. */
  indexOf(pageObjectNumber: number): number {
    if (!this.indexes) {
      const { fn } = this.runtime;
      const indexes = new Map<number, number>();
      const count = fn.FPDF_GetPageCount(this.docPtr);
      for (let index = 0; index < count; index++) {
        const objectNumber = fn.EPDFDoc_GetPageObjectNumberByIndex(this.docPtr, index);
        if (objectNumber > 0 && !indexes.has(objectNumber)) indexes.set(objectNumber, index);
      }
      this.indexes = indexes;
    }
    return this.indexes.get(pageObjectNumber) ?? -1;
  }
}

/**
 * Whether a push button holds an image: one of its widgets has an icon
 * (`/MK /I`, a form XObject of the document), whoever put it there. Each
 * widget is opened from its page's `/Annots` without loading the page; a
 * widget on no page shows nothing, so it holds none.
 */
export function readButtonHasImage(
  runtime: PdfRuntimeModule,
  docPtr: Ptr,
  widgets: readonly FormFieldWidget[],
  pages: PageIndexLookup,
): boolean {
  const { fn } = runtime;
  for (const widget of widgets) {
    if (!widget.page || widget.objectNumber <= 0) continue;
    const pageIndex = pages.indexOf(widget.page.objectNumber);
    if (pageIndex < 0) continue;
    const index = fn.EPDFPage_GetAnnotIndexByObjectNumberRaw(
      docPtr,
      pageIndex,
      widget.objectNumber,
    );
    if (index < 0) continue;
    const annotPtr = fn.EPDFPage_GetAnnotRaw(docPtr, pageIndex, index);
    if (!annotPtr) continue;
    try {
      if (fn.EPDFAnnot_GetMKIcon(annotPtr, MK_ICON_NORMAL) !== 0) return true;
    } finally {
      fn.FPDFPage_CloseAnnot(annotPtr);
    }
  }
  return false;
}

/**
 * Make a push button's widget show `drawing` as its icon (`/MK /I`) and draw
 * its look again from it, or, with `0`, take the icon out and draw its box
 * again. A widget without an icon is left as it is by `0`, and one that
 * names `drawing` already by `drawing`. The widget is opened from its page's
 * `/Annots`, without loading the page.
 */
export function setWidgetIcon(
  runtime: PdfRuntimeModule,
  session: DocumentSession,
  widget: AnnotationRef,
  drawing: number,
): void {
  const { fn } = runtime;
  const annotPtr = openAnnotRaw(runtime, session, widget);
  try {
    const current = fn.EPDFAnnot_GetMKIcon(annotPtr, MK_ICON_NORMAL);
    if (current === drawing) return;
    const written =
      drawing === 0
        ? fn.EPDFAnnot_ClearMKIcon(annotPtr, MK_ICON_NORMAL)
        : fn.EPDFAnnot_SetMKIcon(annotPtr, MK_ICON_NORMAL, drawing);
    if (!written) {
      throw new EngineError(
        EngineErrorCode.Unknown,
        "the push button's icon (/MK /I) could not be written",
      );
    }
    if (!fn.EPDFAnnot_GenerateFormFieldAP(annotPtr)) {
      throw new EngineError(EngineErrorCode.Unknown, "the push button's look could not be drawn");
    }
  } finally {
    fn.FPDFPage_CloseAnnot(annotPtr);
  }
}

/**
 * The drawing a push button's widget shows as its icon (`/MK /I`), by object
 * number, or 0 for none. The widget is opened raw.
 */
export function readWidgetIcon(
  runtime: PdfRuntimeModule,
  session: DocumentSession,
  widget: AnnotationRef,
): number {
  const annotPtr = openAnnotRaw(runtime, session, widget);
  try {
    return runtime.fn.EPDFAnnot_GetMKIcon(annotPtr, MK_ICON_NORMAL);
  } finally {
    runtime.fn.FPDFPage_CloseAnnot(annotPtr);
  }
}
