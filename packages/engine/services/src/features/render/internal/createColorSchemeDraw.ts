import type { PageColorScheme } from '@embedpdf/engine-core/runtime';
import type { Callback, PdfRuntimeModule, Ptr } from '@embedpdf/engine-runtime';

import { readMatrixF, type MatrixF } from '../../../runtime/memory/structs';

/** `FPDF_CONVERT_FILL_TO_STROKE`: filled shapes are drawn as outlines. */
const FPDF_CONVERT_FILL_TO_STROKE = 0x20;

/**
 * `FPDF_COLORSCHEME`: the path fill, path stroke, text fill and text stroke,
 * each an `FPDF_DWORD` holding an opaque `0xAARRGGBB` color. An `FPDF_DWORD`
 * is an `unsigned long`: 4 bytes in wasm32 and on Windows, 8 in the other
 * native runtimes, where the color is the low word.
 */
function colorBytesOf(runtime: PdfRuntimeModule): 4 | 8 {
  return runtime.kind === 'wasm' || runtime.platform.startsWith('win32') ? 4 : 8;
}

/**
 * `IFSDK_PAUSE`: an int version, then the pointers to `NeedToPauseNow` and to
 * the caller's data. PDFium refuses a render without one, and never pauses a
 * render whose `NeedToPauseNow` is null. The struct is 12 bytes in wasm32 and
 * 24 in the native runtimes, where the pointers are 8 bytes and 8-aligned;
 * the version is first in both.
 */
const PAUSE_BYTES = 24;
const PAUSE_VERSION = 1;
/** Where wasm32 has `NeedToPauseNow`. */
const PAUSE_NEED_TO_PAUSE_NOW_WASM32 = 4;

/** What a page draw needs of PDFium: three calls, the way the matrix render has them. */
export interface PageDraw {
  /** Starts the draw, and returns its status: `FPDF_RENDER_*`. */
  start(): number;
  /** Goes on with a draw that paused. */
  continue(): number;
  /** Ends or cancels the draw, before its bitmap is freed. */
  close(): void;
}

export interface ColorSchemeDrawInput {
  readonly bitmapPtr: Ptr;
  readonly pagePtr: Ptr;
  /** The matrix from page points to bitmap pixels, as the matrix render takes it. */
  readonly matrixPtr: Ptr;
  /** The render flags, without the scheme's own. */
  readonly flags: number;
  readonly scheme: PageColorScheme;
  /** How long PDFium works before it pauses, where it can. */
  readonly budgetMs: number;
}

/** `#rrggbb` as the signed `0xAARRGGBB` word PDFium reads, opaque. */
function argbOf(color: string): number {
  return 0xff000000 | Number.parseInt(color.slice(1), 16) | 0;
}

/**
 * The page's rectangle in the bitmap, and its turn: where PDFium's display
 * matrix must put the whole page for the render matrix. A tile is a small
 * bitmap and a page rectangle far outside it: the matrix places the page's
 * corners, and PDFium clips to the bitmap.
 */
function placementOf(runtime: PdfRuntimeModule, pagePtr: Ptr, matrixPtr: Ptr) {
  const matrix = readMatrixF(runtime.mem, matrixPtr);
  const width = runtime.fn.FPDF_GetPageWidthF(pagePtr);
  const height = runtime.fn.FPDF_GetPageHeightF(pagePtr);
  const across = { x: matrix.a * width, y: matrix.b * width };
  const down = { x: matrix.c * height, y: matrix.d * height };
  const cornerXs = [0, across.x, down.x, across.x + down.x].map((x) => matrix.e + x);
  const cornerYs = [0, across.y, down.y, across.y + down.y].map((y) => matrix.f + y);
  const left = Math.min(...cornerXs);
  const top = Math.min(...cornerYs);
  return {
    startX: Math.round(left),
    startY: Math.round(top),
    sizeX: Math.round(Math.max(...cornerXs) - left),
    sizeY: Math.round(Math.max(...cornerYs) - top),
    rotate: quarterTurnsOf(matrix),
  };
}

/** The clockwise quarter turns of a render matrix of 0, 90, 180 or 270 degrees. */
function quarterTurnsOf(matrix: MatrixF): number {
  if (matrix.b > 0) return 1;
  if (matrix.b < 0) return 3;
  return matrix.a < 0 ? 2 : 0;
}

/**
 * A page draw with PDFium's color scheme, which `FPDF_RenderPageBitmap` takes
 * and the matrix render does not: the page's rectangle and turn, where the
 * matrix render takes a matrix, so a page or a tile is placed on whole
 * pixels: up to about a pixel from where the matrix render puts it.
 *
 * Where the runtime can call back into the host (wasm), PDFium pauses once
 * `budgetMs` has passed, as the matrix render does, so a thread that awaits
 * between slices hears an abort. A native runtime has no callbacks: the draw
 * runs to its end in `start`.
 */
export function createColorSchemeDraw(
  runtime: PdfRuntimeModule,
  input: ColorSchemeDrawInput,
): PageDraw {
  const { mem, fn } = runtime;
  const { bitmapPtr, pagePtr, matrixPtr, flags, scheme, budgetMs } = input;
  let schemePtr: Ptr | null = null;
  let pausePtr: Ptr | null = null;
  let needToPauseNow: Callback | null = null;
  let deadlineMs = 0;

  const free = () => {
    if (needToPauseNow !== null) runtime.cb.dispose(needToPauseNow);
    if (pausePtr !== null) mem.free(pausePtr);
    if (schemePtr !== null) mem.free(schemePtr);
    needToPauseNow = pausePtr = schemePtr = null;
  };
  const startSlice = () => {
    deadlineMs = performance.now() + budgetMs;
  };

  return {
    start() {
      try {
        const colorBytes = colorBytesOf(runtime);
        const colors = (schemePtr = mem.alloc(4 * colorBytes));
        for (let at = 0; at < 4 * colorBytes; at += 4) mem.poke(colors, 'i32', 0, at);
        [scheme.pathFill, scheme.pathStroke, scheme.textFill, scheme.textStroke].forEach(
          (color, at) => mem.poke(colors, 'i32', argbOf(color), at * colorBytes),
        );
        const pause = (pausePtr = mem.alloc(PAUSE_BYTES));
        for (let at = 0; at < PAUSE_BYTES; at += 4) mem.poke(pause, 'i32', 0, at);
        mem.poke(pause, 'i32', PAUSE_VERSION, 0);
        if (runtime.kind === 'wasm') {
          needToPauseNow = runtime.cb.register('ii', () =>
            performance.now() >= deadlineMs ? 1 : 0,
          );
          mem.poke(pause, 'i32', Number(needToPauseNow), PAUSE_NEED_TO_PAUSE_NOW_WASM32);
        }
        startSlice();
        const at = placementOf(runtime, pagePtr, matrixPtr);
        return fn.FPDF_RenderPageBitmapWithColorScheme_Start(
          bitmapPtr,
          pagePtr,
          at.startX,
          at.startY,
          at.sizeX,
          at.sizeY,
          at.rotate,
          scheme.convertFillToStroke ? flags | FPDF_CONVERT_FILL_TO_STROKE : flags,
          colors,
          pause,
        );
      } catch (error) {
        // The reader closes a draw that started, not one that threw.
        free();
        throw error;
      }
    },
    continue() {
      startSlice();
      return fn.FPDF_RenderPage_Continue(pagePtr, pausePtr!);
    },
    close() {
      try {
        fn.FPDF_RenderPage_Close(pagePtr);
      } finally {
        free();
      }
    },
  };
}
