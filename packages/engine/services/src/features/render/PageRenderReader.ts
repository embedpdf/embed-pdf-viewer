import type {
  PageObjectNumber,
  PageRaster,
  PageRenderOptions,
  PageRenderTarget,
  PdfRect,
} from '@embedpdf/engine-core/runtime';
import { EngineError, EngineErrorCode, normalizePdfRect } from '@embedpdf/engine-core/runtime';
import type { PdfRuntimeModule } from '@embedpdf/engine-runtime';

import { FPDF_REVERSE_BYTE_ORDER, rasterizeAsync, readPageBox } from './deviceRaster';
import type { DocumentSession } from '../../document-session/DocumentSession';
import { throwIfAborted } from '../../shared/abort';

const FPDF_RENDER_ANNOT = 0x01;
const FPDF_RENDER_TOBECONTINUED = 1;
const FPDF_RENDER_DONE = 2;

/**
 * How a page render is sliced. PDFium renders for `budgetMs` at a time and the
 * render awaits `between()` before it goes on, so the thread can receive
 * messages meanwhile: an abort stops the render at the next slice. The bytes
 * are those of a render at once, however it is sliced.
 */
export interface RenderSlices {
  readonly budgetMs: number;
  between(): Promise<void>;
}

export class PageRenderReader {
  constructor(
    private readonly runtime: PdfRuntimeModule,
    private readonly session: DocumentSession,
  ) {}

  /**
   * Renders a page in slices. Until it settles, PDFium holds the page's render:
   * the caller must not let anything else use PDFium between slices.
   */
  async render(
    pageObjectNumber: PageObjectNumber,
    options: PageRenderOptions,
    signal: AbortSignal,
    slices: RenderSlices,
  ): Promise<PageRaster> {
    throwIfAborted(signal);
    const { fn } = this.runtime;
    const pool = this.session.pagePool();
    const pagePtr = pool.acquire(pageObjectNumber);

    try {
      throwIfAborted(signal);

      const page = readPageBox(this.runtime, pagePtr);
      const target = resolveTarget(options.target, page);
      const rotation = options.rotation ?? 0;
      const viewport = options.viewport ?? { kind: 'scale', scale: 1 };

      let flags = FPDF_REVERSE_BYTE_ORDER;
      if (options.includeAnnotations ?? true) flags |= FPDF_RENDER_ANNOT;

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
      return raster;
    } finally {
      pool.release(pageObjectNumber);
    }
  }
}

/**
 * Resolve the render target to a normalized PDF-space rect: the page box, or
 * a sub-rect in the page's own coordinates (as annotation rects are).
 */
function resolveTarget(target: PageRenderTarget | undefined, page: PdfRect): PdfRect {
  if (!target || target.kind === 'page') return page;
  const rect = normalizePdfRect(target.rect);
  if (rect.right <= rect.left || rect.top <= rect.bottom) {
    throw new EngineError(EngineErrorCode.InvalidArg, 'render rect must have positive area');
  }
  return rect;
}
