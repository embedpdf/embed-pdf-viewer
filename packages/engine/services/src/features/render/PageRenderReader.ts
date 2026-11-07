import type {
  PageObjectNumber,
  PageRaster,
  PageRenderOptions,
  PageRenderTarget,
  PdfCoordinates,
  PdfRect,
} from '@embedpdf/engine-core/runtime';
import {
  EngineError,
  EngineErrorCode,
  checkRenderUsage,
  normalizePdfRect,
  resolvePageLayers,
} from '@embedpdf/engine-core/runtime';
import type { PdfRuntimeModule } from '@embedpdf/engine-runtime';

import { FPDF_REVERSE_BYTE_ORDER, rasterizeAsync, readPageBox } from './deviceRaster';
import type { DocumentSession } from '../../document-session/DocumentSession';
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
    options: PageRenderOptions<PdfCoordinates>,
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
      let flags = FPDF_REVERSE_BYTE_ORDER;
      if (layers.includeAnnotations) flags |= FPDF_RENDER_ANNOT;
      if (layers.includeFormFields) flags |= EPDF_RENDER_WIDGETS;
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
          return status === FPDF_RENDER_DONE;
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
