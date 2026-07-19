import type {
  PageRaster,
  PageRenderBackground,
  PageRenderViewport,
  PdfRect,
  PdfRotation,
} from '@embedpdf/engine-core/runtime';
import { EngineError, EngineErrorCode } from '@embedpdf/engine-core/runtime';
import type { PdfRuntimeModule, Ptr } from '@embedpdf/engine-runtime';

/**
 * The ONE place a PDF user-space region becomes a device raster.
 *
 * Every PDFium rasterizer — `PageRenderReader`, `AnnotationAppearanceReader`,
 * and any future one (thumbnails, stamps, flatten) — composes these three
 * pieces and supplies only its own `draw` call. The geometry is a pure affine
 * (the engine twin of the viewer's `Mat2D`/`rotateScaleMatrix`); the bitmap
 * lifecycle (alloc → fill → draw → read back → free) lives in `rasterize`.
 */

const FPDF_BITMAP_BGRA = 4;
/** Emit RGBA byte order (vs PDFium's native BGRA) so callers get `rgba8` directly. */
export const FPDF_REVERSE_BYTE_ORDER = 0x10;

/** A 2D affine as the same six numbers as the viewer `Mat2D`, CSS `matrix()`, FS_MATRIX. */
export type Mat2D = readonly [a: number, b: number, c: number, d: number, e: number, f: number];

/**
 * Map a normalized post-`GetDisplayMatrix()` display-space rect onto an
 * `outW × outH` device bitmap, baking in the caller's viewport rotation.
 *
 * PDFium's page and annotation renderers pre-apply `CPDF_Page::GetDisplayMatrix()`
 * before concatenating the caller matrix. That display matrix has already
 * converted PDF page coordinates (y-up) into bitmap/display coordinates
 * (y-down), so the caller matrix must target that post-display rect.
 */
export function displayRectToDeviceMatrix(
  rect: PdfRect,
  rotation: PdfRotation,
  outW: number,
  outH: number,
): Mat2D {
  const left = rect.left;
  const bottom = rect.bottom;
  const width = rect.right - rect.left;
  const height = rect.top - rect.bottom;
  const sx0 = outW / width;
  const sy0 = outH / height;
  const sx90 = outW / height;
  const sy90 = outH / width;

  switch (rotation) {
    case 90:
      return [0, sy90, -sx90, 0, sx90 * (bottom + height), -sy90 * left];
    case 180:
      return [-sx0, 0, 0, -sy0, sx0 * (left + width), sy0 * (bottom + height)];
    case 270:
      return [0, -sy90, sx90, 0, -sx90 * bottom, sy90 * (left + width)];
    case 0:
      return [sx0, 0, 0, sy0, -sx0 * left, -sy0 * bottom];
  }
}

/**
 * Device pixel size for a region under a rotation + viewport. `width` swaps with
 * height on quarter-turns. Validates the viewport (the public-API contract).
 */
export function deviceSize(
  rect: PdfRect,
  rotation: PdfRotation,
  viewport: PageRenderViewport,
): { width: number; height: number } {
  const rectWidth = rect.right - rect.left;
  const rectHeight = rect.top - rect.bottom;
  const swap = rotation === 90 || rotation === 270;
  const baseWidth = swap ? rectHeight : rectWidth;
  const baseHeight = swap ? rectWidth : rectHeight;

  if (viewport.kind === 'width') {
    if (!Number.isFinite(viewport.width) || viewport.width <= 0) {
      throw new EngineError(EngineErrorCode.InvalidArg, 'render viewport width must be positive');
    }
    const width = Math.max(1, Math.round(viewport.width));
    return { width, height: Math.max(1, Math.round((width * baseHeight) / baseWidth)) };
  }

  const scale = viewport.scale ?? 1;
  if (!Number.isFinite(scale) || scale <= 0) {
    throw new EngineError(EngineErrorCode.InvalidArg, 'render viewport scale must be positive');
  }
  return {
    width: Math.max(1, Math.round(baseWidth * scale)),
    height: Math.max(1, Math.round(baseHeight * scale)),
  };
}

export interface RasterizeOptions {
  /** The region to render, in PDF user space — ALREADY normalized by the caller. */
  rect: PdfRect;
  /** Page dimensions in PDF user space, used to mirror PDFium's display matrix. */
  page: { width: number; height: number };
  rotation: PdfRotation;
  viewport: PageRenderViewport;
  background: PageRenderBackground;
  /**
   * Perform the PDFium draw into `bitmapPtr` with the prepared user `matrixPtr`
   * (and `clipPtr`, the full-bitmap clip — annotation renders ignore it). Return
   * false to abort the raster (e.g. the PDFium call failed).
   */
  draw: (bitmapPtr: Ptr, matrixPtr: Ptr, clipPtr: Ptr) => boolean;
}

/**
 * Owns the whole bitmap lifecycle: allocate the pixel buffer + bitmap + matrix
 * (+ clip), fill the background, run the caller's `draw`, read the pixels back
 * into a `PageRaster`, and free everything. Returns null on a degenerate rect or
 * a failed allocation/draw.
 */
export function rasterize(runtime: PdfRuntimeModule, opts: RasterizeOptions): PageRaster | null {
  const { fn, mem } = runtime;
  const { rect, page, rotation, viewport, background, draw } = opts;

  // Degenerate (zero/negative area) has no renderable output and would divide by
  // zero in the matrix.
  if (rect.right <= rect.left || rect.top <= rect.bottom) return null;

  const displayRect = pdfRectToDisplayRect(rect, page.height);
  const { width, height } = deviceSize(displayRect, rotation, viewport);
  const stride = width * 4;
  const bytes = stride * height;

  let pixelPtr: Ptr | null = null;
  let bitmapPtr: Ptr | null = null;
  let matrixPtr: Ptr | null = null;
  let clipPtr: Ptr | null = null;
  try {
    pixelPtr = mem.alloc(bytes);
    bitmapPtr = fn.FPDFBitmap_CreateEx(width, height, FPDF_BITMAP_BGRA, pixelPtr, stride);
    if (!bitmapPtr) return null;

    fn.FPDFBitmap_FillRect(
      bitmapPtr,
      0,
      0,
      width,
      height,
      background === 'transparent' ? 0x00000000 : 0xffffffff,
    );

    matrixPtr = mem.alloc(6 * 4);
    pokeMat2D(mem, matrixPtr, displayRectToDeviceMatrix(displayRect, rotation, width, height));

    clipPtr = mem.alloc(4 * 4);
    mem.poke(clipPtr, 'f32', 0, 0);
    mem.poke(clipPtr, 'f32', 0, 4);
    mem.poke(clipPtr, 'f32', width, 8);
    mem.poke(clipPtr, 'f32', height, 12);

    if (!draw(bitmapPtr, matrixPtr, clipPtr)) return null;

    const pixels = mem.readBytes(pixelPtr, bytes);
    return {
      width,
      height,
      stride,
      color: 'rgba8',
      premultipliedAlpha: false,
      data: toExactArrayBuffer(pixels),
    };
  } finally {
    if (bitmapPtr) fn.FPDFBitmap_Destroy(bitmapPtr);
    if (clipPtr) mem.free(clipPtr);
    if (matrixPtr) mem.free(matrixPtr);
    if (pixelPtr) mem.free(pixelPtr);
  }
}

function pdfRectToDisplayRect(rect: PdfRect, pageHeight: number): PdfRect {
  return {
    left: rect.left,
    right: rect.right,
    bottom: pageHeight - rect.top,
    top: pageHeight - rect.bottom,
  };
}

function pokeMat2D(mem: PdfRuntimeModule['mem'], ptr: Ptr, m: Mat2D): void {
  for (let i = 0; i < 6; i++) mem.poke(ptr, 'f32', m[i], i * 4);
}

function toExactArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const out = new Uint8Array(bytes.byteLength);
  out.set(bytes);
  return out.buffer;
}
