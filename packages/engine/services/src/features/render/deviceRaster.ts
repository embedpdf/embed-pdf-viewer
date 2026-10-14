import type {
  PageBox,
  PageRaster,
  PageRenderBackground,
  PageRenderViewport,
  PdfRect,
  PdfRotation,
} from '@embedpdf/engine-core/runtime';
import {
  EngineError,
  EngineErrorCode,
  normalizePdfRect,
  renderMatrix,
  renderSize,
  type PageRenderMatrix,
} from '@embedpdf/engine-core/runtime';
import type { PdfRuntimeModule, Ptr } from '@embedpdf/engine-runtime';

import { withScratch } from '../../runtime/memory/scratch';
import { readRectF } from '../../runtime/memory/structs';

/**
 * The one place a PDF user-space region becomes a device raster.
 *
 * Every PDFium rasterizer — `PageRenderReader`, `AnnotationAppearanceReader`,
 * and any future one (thumbnails, stamps, flatten) — composes these three
 * pieces and supplies only its own `draw` call. The geometry is engine-core's
 * `renderMatrix`, the matrix a page transform reports; the bitmap
 * lifecycle (alloc → fill → draw → read back → free) lives in `rasterize` and,
 * for a draw that awaits, `rasterizeAsync`.
 */

const FPDF_BITMAP_BGRA = 4;
/** Emit RGBA byte order (vs PDFium's native BGRA) so callers get `rgba8` directly. */
export const FPDF_REVERSE_BYTE_ORDER = 0x10;

/**
 * Device pixel size for a region under a rotation + viewport (engine-core
 * {@link renderSize}, which the cloud client reports too).
 */
export function deviceSize(
  rect: PdfRect,
  rotation: PdfRotation,
  viewport: PageRenderViewport,
): { width: number; height: number } {
  return renderSize(
    { width: rect.right - rect.left, height: rect.top - rect.bottom },
    rotation,
    viewport,
  );
}

export interface RasterizeOptions {
  /** The region to render, in PDF user space — already normalized by the caller. */
  rect: PdfRect;
  /**
   * The page's display box in PDF user space ({@link readPageBox}), for
   * mirroring PDFium's display matrix: display space starts at its corner.
   */
  page: PdfRect;
  rotation: PdfRotation;
  viewport: PageRenderViewport;
  background: PageRenderBackground;
  /**
   * Output-pixel budget: reject before allocating when the computed device
   * size exceeds it (the decode-bomb-guard pattern — the check lives where
   * the allocation happens). PDF page space is effectively unbounded, so a
   * width-bounded request can still explode vertically on degenerate
   * geometry. Optional: Local renders omit it (exactness is the local
   * product promise); server renders carry the deployment policy's budget.
   */
  maxOutputPixels?: number;
  /**
   * Perform the PDFium draw into `bitmapPtr` with the prepared user `matrixPtr`
   * (and `clipPtr`, the full-bitmap clip — annotation renders ignore it). Return
   * false to abort the raster (e.g. the PDFium call failed).
   */
  draw: (bitmapPtr: Ptr, matrixPtr: Ptr, clipPtr: Ptr) => boolean;
}

/** {@link RasterizeOptions} with a `draw` that may await, as a sliced page render does. */
export interface RasterizeAsyncOptions extends Omit<RasterizeOptions, 'draw'> {
  draw: (bitmapPtr: Ptr, matrixPtr: Ptr, clipPtr: Ptr) => Promise<boolean>;
}

/**
 * Owns the whole bitmap lifecycle: allocate the pixel buffer + bitmap + matrix
 * (+ clip), fill the background, run the caller's `draw`, read the pixels back
 * into a `PageRaster`, and free everything. Returns null on a degenerate rect or
 * a failed allocation/draw.
 */
export function rasterize(runtime: PdfRuntimeModule, opts: RasterizeOptions): PageRaster | null {
  const target = allocateRaster(runtime, opts);
  if (!target) return null;
  try {
    return opts.draw(target.bitmapPtr, target.matrixPtr, target.clipPtr) ? target.read() : null;
  } finally {
    target.free();
  }
}

/** {@link rasterize} with a `draw` that may await; everything stays allocated until it settles. */
export async function rasterizeAsync(
  runtime: PdfRuntimeModule,
  opts: RasterizeAsyncOptions,
): Promise<PageRaster | null> {
  const target = allocateRaster(runtime, opts);
  if (!target) return null;
  try {
    return (await opts.draw(target.bitmapPtr, target.matrixPtr, target.clipPtr))
      ? target.read()
      : null;
  } finally {
    target.free();
  }
}

/** A filled bitmap and its matrix and clip, ready for a draw. */
interface RasterTarget {
  readonly bitmapPtr: Ptr;
  readonly matrixPtr: Ptr;
  readonly clipPtr: Ptr;
  /** Copies the pixels out. */
  read(): PageRaster;
  free(): void;
}

function allocateRaster(
  runtime: PdfRuntimeModule,
  opts: Omit<RasterizeOptions, 'draw'>,
): RasterTarget | null {
  const { fn, mem } = runtime;
  const { rect, page, rotation, viewport, background } = opts;

  // Degenerate (zero/negative area) has no renderable output and would divide by
  // zero in the matrix.
  if (rect.right <= rect.left || rect.top <= rect.bottom) return null;

  const displayRect = pdfRectToDisplayRect(rect, page);
  const { width, height } = deviceSize(displayRect, rotation, viewport);
  if (opts.maxOutputPixels !== undefined && width * height > opts.maxOutputPixels) {
    throw new EngineError(
      EngineErrorCode.InvalidArg,
      `render output ${width}x${height} exceeds the ${opts.maxOutputPixels}-pixel budget — ` +
        'request a smaller width (or tiles, once available)',
    );
  }
  const stride = width * 4;
  const bytes = stride * height;

  let pixelPtr: Ptr | null = null;
  let bitmapPtr: Ptr | null = null;
  let matrixPtr: Ptr | null = null;
  let clipPtr: Ptr | null = null;
  const free = () => {
    if (bitmapPtr) fn.FPDFBitmap_Destroy(bitmapPtr);
    if (clipPtr) mem.free(clipPtr);
    if (matrixPtr) mem.free(matrixPtr);
    if (pixelPtr) mem.free(pixelPtr);
  };
  try {
    pixelPtr = mem.alloc(bytes);
    bitmapPtr = fn.FPDFBitmap_CreateEx(width, height, FPDF_BITMAP_BGRA, pixelPtr, stride);
    if (!bitmapPtr) {
      free();
      return null;
    }

    fn.FPDFBitmap_FillRect(
      bitmapPtr,
      0,
      0,
      width,
      height,
      background === 'transparent' ? 0x00000000 : 0xffffffff,
    );

    matrixPtr = mem.alloc(6 * 4);
    // The page's display matrix already turned PDF space into page space (the
    // display rect), so this is the matrix a page transform reports.
    pokeMatrix(
      mem,
      matrixPtr,
      renderMatrix(pageBoxOfDisplayRect(displayRect), rotation, width, height),
    );

    clipPtr = mem.alloc(4 * 4);
    mem.poke(clipPtr, 'f32', 0, 0);
    mem.poke(clipPtr, 'f32', 0, 4);
    mem.poke(clipPtr, 'f32', width, 8);
    mem.poke(clipPtr, 'f32', height, 12);
  } catch (error) {
    free();
    throw error;
  }

  const pixels = pixelPtr;
  return {
    bitmapPtr,
    matrixPtr,
    clipPtr,
    read: () => ({
      width,
      height,
      stride,
      color: 'rgba8',
      premultipliedAlpha: false,
      data: toExactArrayBuffer(mem.readBytes(pixels, bytes)),
    }),
    free,
  };
}

/**
 * The page's display box in PDF user space: the box PDFium's display matrix
 * maps to the page's pixels (the crop box of a page loaded normalized). A rect
 * in PDF user space, as annotation rects and render targets are, is placed
 * relative to it.
 */
export function readPageBox(runtime: PdfRuntimeModule, pagePtr: Ptr): PdfRect {
  const { fn, mem } = runtime;
  const box = withScratch(mem, 16, (ptr) =>
    fn.FPDF_GetPageBoundingBox(pagePtr, ptr) ? readRectF(mem, ptr) : null,
  );
  if (box) return normalizePdfRect(box);
  return {
    left: 0,
    bottom: 0,
    right: fn.FPDF_GetPageWidthF(pagePtr),
    top: fn.FPDF_GetPageHeightF(pagePtr),
  };
}

/** A display rect (edges, y down) as a page-space box. */
function pageBoxOfDisplayRect(rect: PdfRect): PageBox {
  return {
    x: rect.left,
    y: rect.bottom,
    width: rect.right - rect.left,
    height: rect.top - rect.bottom,
  };
}

/** A PDF user-space rect in display space: from the page box's top-left, y down. */
function pdfRectToDisplayRect(rect: PdfRect, page: PdfRect): PdfRect {
  return {
    left: rect.left - page.left,
    right: rect.right - page.left,
    bottom: page.top - rect.top,
    top: page.top - rect.bottom,
  };
}

function pokeMatrix(mem: PdfRuntimeModule['mem'], ptr: Ptr, m: PageRenderMatrix): void {
  for (let i = 0; i < 6; i++) mem.poke(ptr, 'f32', m[i], i * 4);
}

function toExactArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const out = new Uint8Array(bytes.byteLength);
  out.set(bytes);
  return out.buffer;
}
