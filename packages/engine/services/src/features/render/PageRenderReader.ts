import type {
  PageObjectNumber,
  AnnotationRef,
  PageRaster,
  RawPageRenderOptions,
  PageRenderTarget,
  PdfCoordinates,
  PdfRect,
} from '@embedpdf/engine-core/runtime';
import {
  EngineError,
  EngineErrorCode,
  annotationKey,
  checkRenderUsage,
  toPageRef,
  normalizePdfRect,
  resolvePageLayers,
} from '@embedpdf/engine-core/runtime';
import type { Ptr, PdfRuntimeModule } from '@embedpdf/engine-runtime';

import { FPDF_REVERSE_BYTE_ORDER, rasterizeAsync, readPageBox } from './deviceRaster';
import type { DocumentSession } from '../../document-session/DocumentSession';
import { familyOfCode } from '../annotations/internal/familyOfCode';
import { annotationRefOf } from '../annotations/internal/identity/annotationName';
import { throwIfAborted } from '../../shared/abort';
import type { Slices } from '../../shared/slices';

/** `FPDF_ANNOT`: the annotations, form fields' widgets excepted. */
const FPDF_RENDER_ANNOT = 0x01;
/** `EPDF_RENDER_WIDGETS`: the form fields' widgets. */
const EPDF_RENDER_WIDGETS = 0x8000;
/**
 * `FPDF_PRINTING`: the print rules. Layers take their print state, and
 * annotations and widgets draw by their `print` flag (no-view ones too).
 */
const FPDF_PRINTING = 0x800;
/** Annotation flags (ISO 32000-2 12.5.3) a picture draws by. */
const ANNOT_FLAG_HIDDEN = 0x02;
const ANNOT_FLAG_PRINT = 0x04;
const ANNOT_FLAG_NO_VIEW = 0x20;
/** `FPDF_ANNOT_POPUP`: drawn by the viewer, never into the page. */
const ANNOT_SUBTYPE_POPUP = 16;
/** `FPDF_ANNOT_APPEARANCEMODE_NORMAL`. */
const APPEARANCE_NORMAL = 0;
const FPDF_RENDER_TOBECONTINUED = 1;
const FPDF_RENDER_DONE = 2;

export class PageRenderReader {
  constructor(
    private readonly runtime: PdfRuntimeModule,
    private readonly session: DocumentSession,
  ) {}

  /**
   * Renders a page in slices, and says which area of it the pixels show.
   * Until it settles, PDFium holds the page's render: the caller must not let
   * anything else use PDFium between slices.
   */
  async render(
    pageObjectNumber: PageObjectNumber,
    options: RawPageRenderOptions<PdfCoordinates>,
    signal: AbortSignal,
    slices: Slices,
  ): Promise<{ raster: PageRaster; area: PdfRect }> {
    throwIfAborted(signal);
    const { fn } = this.runtime;
    const pool = this.session.pagePool();
    // A page not parsed yet loads in slices too, so an abort stops its load.
    const pagePtr = await pool.acquireInSlices(pageObjectNumber, signal, slices);

    try {
      throwIfAborted(signal);

      // The worker draws what it's asked: who may see or print what is
      // checked before a render gets here, so a left-out option draws
      // everything. A print picture is the whole page, upright, sized for
      // its paper by its `dpi` viewport; a thumbnail is the whole page at the
      // thumbnail size.
      checkRenderUsage(options, null);
      const print = options.usage === 'print';
      const page = readPageBox(this.runtime, pagePtr);
      const target = resolveTarget(options.target, page);
      const rotation = options.rotation ?? 0;
      const viewport = options.viewport ?? { kind: 'scale', scale: 1 };

      const layers = resolvePageLayers(options, { annotations: true, formFields: true });
      // Leaving some out, the page draws bare and the rest are drawn over it
      // one by one, in PDFium's order: every annotation, then every widget.
      const excluded = options.excludeAnnotations?.length
        ? new Set<string>(options.excludeAnnotations.map(annotationKey))
        : null;
      let flags = FPDF_REVERSE_BYTE_ORDER;
      if (layers.includeAnnotations && !excluded) flags |= FPDF_RENDER_ANNOT;
      if (layers.includeFormFields && !excluded) flags |= EPDF_RENDER_WIDGETS;
      if (print) flags |= FPDF_PRINTING;

      const raster = await rasterizeAsync(this.runtime, {
        rect: target,
        page,
        rotation,
        viewport,
        ...(options.maxOutputPixels !== undefined
          ? { maxOutputPixels: options.maxOutputPixels }
          : {}),
        background: options.background === 'transparent' ? 'transparent' : 'white',
        draw: async (bitmapPtr, matrixPtr, clipPtr) => {
          throwIfAborted(signal);
          let status = fn.EPDF_RenderPageBitmapWithMatrix_Start(
            bitmapPtr,
            pagePtr,
            matrixPtr,
            clipPtr,
            flags,
            slices.budgetMs,
          );
          try {
            while (status === FPDF_RENDER_TOBECONTINUED) {
              await slices.between();
              throwIfAborted(signal);
              status = fn.EPDF_RenderPage_Continue(pagePtr, slices.budgetMs);
            }
          } finally {
            // Before the bitmap is freed and the page released: the render
            // draws into the bitmap until it is closed.
            fn.FPDF_RenderPage_Close(pagePtr);
          }
          if (status !== FPDF_RENDER_DONE) return false;
          if (excluded) {
            throwIfAborted(signal);
            this.drawAnnotations(pagePtr, pageObjectNumber, bitmapPtr, matrixPtr, {
              excluded,
              annotations: layers.includeAnnotations,
              widgets: layers.includeFormFields,
              print,
            });
          }
          return true;
        },
      });
      if (!raster) {
        throw new EngineError(
          EngineErrorCode.RuntimeUnavailable,
          `failed to render page object ${pageObjectNumber}`,
        );
      }
      return { raster, area: target };
    } finally {
      pool.release(pageObjectNumber);
    }
  }

  /**
   * Draws the page's annotations and widgets over a bare page render, the
   * ones in `excluded` left out, by the same rules as PDFium's own pass:
   * annotations before widgets, each in `/Annots` order; no popups; hidden
   * ones never; no-view ones only in print, where only printable ones draw.
   */
  private drawAnnotations(
    pagePtr: Ptr,
    pageObjectNumber: PageObjectNumber,
    bitmapPtr: Ptr,
    matrixPtr: Ptr,
    pass: {
      excluded: ReadonlySet<string>;
      annotations: boolean;
      widgets: boolean;
      print: boolean;
    },
  ): void {
    const { fn, mem } = this.runtime;
    const docPtr = this.session.requireDocPtr();
    const page = toPageRef(pageObjectNumber);
    const count = fn.FPDFPage_GetAnnotCount(pagePtr);
    const draw = (index: number, family: 'annotations' | 'widgets'): void => {
      const annotPtr = fn.FPDFPage_GetAnnot(pagePtr, index);
      if (!annotPtr) return;
      try {
        const subtype = fn.FPDFAnnot_GetSubtype(annotPtr);
        if (subtype === ANNOT_SUBTYPE_POPUP || familyOfCode(subtype) !== family) return;
        if (!(family === 'annotations' ? pass.annotations : pass.widgets)) return;
        const flags = fn.FPDFAnnot_GetFlags(annotPtr);
        if (flags & ANNOT_FLAG_HIDDEN) return;
        if (pass.print ? !(flags & ANNOT_FLAG_PRINT) : flags & ANNOT_FLAG_NO_VIEW) return;
        const ref: AnnotationRef = annotationRefOf(fn, mem, docPtr, page, annotPtr, index);
        if (pass.excluded.has(annotationKey(ref))) return;
        fn.EPDF_RenderAnnotBitmap(
          bitmapPtr,
          pagePtr,
          annotPtr,
          APPEARANCE_NORMAL,
          '',
          matrixPtr,
          FPDF_REVERSE_BYTE_ORDER,
        );
      } finally {
        fn.FPDFPage_CloseAnnot(annotPtr);
      }
    };
    for (let i = 0; i < count; i++) draw(i, 'annotations');
    for (let i = 0; i < count; i++) draw(i, 'widgets');
  }
}

/**
 * Resolve the render target to a normalized PDF-space rect: the page box, or
 * a sub-rect in the page's own coordinates (as annotation rects are).
 */
function resolveTarget(
  target: PageRenderTarget<PdfCoordinates> | undefined,
  page: PdfRect,
): PdfRect {
  if (!target || target.kind === 'page') return page;
  const rect = normalizePdfRect(target.rect);
  // Written so a rect that isn't numbers (NaN) is refused too.
  if (!(rect.right > rect.left && rect.top > rect.bottom)) {
    throw new EngineError(EngineErrorCode.InvalidArg, 'render rect must have positive area');
  }
  return rect;
}
