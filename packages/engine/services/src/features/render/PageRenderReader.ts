import type {
  PageObjectNumber,
  PageRenderOptions,
  PageRenderTarget,
  PdfRect,
} from '@embedpdf/engine-core/runtime';
import { EngineError, EngineErrorCode, normalizePdfRect } from '@embedpdf/engine-core/runtime';
import type { PdfRuntimeModule } from '@embedpdf/engine-runtime';

import { FPDF_REVERSE_BYTE_ORDER, rasterize } from './deviceRaster';
import type { DocumentSession } from '../../document-session/DocumentSession';
import { throwIfAborted } from '../../shared/abort';

const FPDF_RENDER_ANNOT = 0x01;

export class PageRenderReader {
  constructor(
    private readonly runtime: PdfRuntimeModule,
    private readonly session: DocumentSession,
  ) {}

  render(pageObjectNumber: PageObjectNumber, options: PageRenderOptions, signal: AbortSignal) {
    throwIfAborted(signal);
    const { fn } = this.runtime;
    const pool = this.session.pagePool();
    const pagePtr = pool.acquire(pageObjectNumber);

    try {
      throwIfAborted(signal);

      const pageWidth = fn.FPDF_GetPageWidthF(pagePtr);
      const pageHeight = fn.FPDF_GetPageHeightF(pagePtr);
      const target = resolveTarget(options.target, pageWidth, pageHeight);
      const rotation = options.rotation ?? 0;
      const viewport = options.viewport ?? { kind: 'scale', scale: 1 };

      let flags = FPDF_REVERSE_BYTE_ORDER;
      if (options.includeAnnotations ?? true) flags |= FPDF_RENDER_ANNOT;

      const raster = rasterize(this.runtime, {
        rect: target,
        page: { width: pageWidth, height: pageHeight },
        rotation,
        viewport,
        background: options.background === 'transparent' ? 'transparent' : 'white',
        draw: (bitmapPtr, matrixPtr, clipPtr) => {
          throwIfAborted(signal);
          fn.FPDF_RenderPageBitmapWithMatrix(bitmapPtr, pagePtr, matrixPtr, clipPtr, flags);
          throwIfAborted(signal);
          return true;
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

/** Resolve the render target to a normalized PDF-space rect (page box, or a sub-rect). */
function resolveTarget(
  target: PageRenderTarget | undefined,
  pageWidth: number,
  pageHeight: number,
): PdfRect {
  if (!target || target.kind === 'page') {
    return { left: 0, bottom: 0, right: pageWidth, top: pageHeight };
  }
  const rect = normalizePdfRect(target.rect);
  if (rect.right <= rect.left || rect.top <= rect.bottom) {
    throw new EngineError(EngineErrorCode.InvalidArg, 'render rect must have positive area');
  }
  return rect;
}
