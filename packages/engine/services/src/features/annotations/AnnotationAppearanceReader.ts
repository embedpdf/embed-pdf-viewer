import type {
  AnnotationFamily,
  AnnotationAppearanceMode,
  AnnotationAppearanceRaster,
  AnnotationAppearanceRenderOptions,
  AnnotationAppearancesResult,
  PageObjectNumber,
  PageRaster,
  PageRenderViewport,
  PdfCoordinates,
  PdfRect,
  PdfRotation,
} from '@embedpdf/engine-core/runtime';
import {
  appearanceModesOf,
  pdfAppearanceTurnOf,
  EngineError,
  EngineErrorCode,
  normalizePdfRect,
  subtypeFromCode,
  toPageRef,
} from '@embedpdf/engine-core/runtime';
import type {
  PdfFunctions,
  PdfRuntimeMemory,
  PdfRuntimeModule,
  Ptr,
} from '@embedpdf/engine-runtime';

import { freeTextIntentFromName } from './internal/freeTextIntent';
import type { DocumentSession } from '../../document-session/DocumentSession';
import { withScratch } from '../../runtime/memory/scratch';
import { RECTF_BYTES, readRectF, writeRectF } from '../../runtime/memory/structs';
import { FPDF_REVERSE_BYTE_ORDER, rasterize, readPageBox } from '../render/deviceRaster';
import {
  readAnnotRect,
  readAppearanceState,
  readAppearanceStateNames,
  readIntent,
} from './internal/read/annotationReadPrimitives';
import { familyOfCode } from './internal/familyOfCode';
import { annotationRefOf } from './internal/identity/annotationName';
import { pdfFromClockwise } from './internal/read/readAnnotationTransformMetadata';
import { throwIfAborted } from '../../shared/abort';
import { SliceTimer, type Slices } from '../../shared/slices';
import { readAnnotationTurn, type AnnotationTurn } from './internal/read/readAnnotationTurn';

/** `FPDF_ANNOT_FREETEXT` — free-text annotation subtype code. */
const ANNOT_SUBTYPE_FREETEXT = 3;

/**
 * Per-appearance output-pixel ceiling (see the clamp in `renderOne`).
 * 16 M px ≈ a 4000² raster ≈ 64 MB of transient RGBA — safely inside the
 * wasm heap for the one-at-a-time batch loop, while a page-sized annotation
 * stays crisp to roughly 5–6× before its appearance starts stretching.
 * Small annotations (the overwhelming majority) never come near it.
 */
const APPEARANCE_PIXEL_CLAMP = 16_000_000;

/**
 * Maps an `AnnotationAppearanceMode` onto the PDFium appearance-mode int and
 * the `EPDFAnnot_GetAvailableAppearanceModes` bit it occupies.
 *   N -> mode 0 / bit 1, R -> mode 1 / bit 2, D -> mode 2 / bit 4.
 */
const APPEARANCE_MODES: ReadonlyArray<{
  name: AnnotationAppearanceMode;
  modeInt: number;
  bit: number;
}> = [
  { name: 'normal', modeInt: 0, bit: 1 },
  { name: 'rollover', modeInt: 1, bit: 2 },
  { name: 'down', modeInt: 2, bit: 4 },
];

/**
 * Batch-renders the appearances of one family of a page's annotations (its
 * annotations except widgets, or its widgets), one bitmap per mode it stores
 * (or each requested one) and per state of that mode, each labelled with
 * both, in PDF user space and against the `PdfRuntimeModule` (`fn` + `mem`).
 *
 * A stored appearance (`/AP`) renders into its annotation's `/Rect`. An
 * annotation with no normal appearance renders as PDFium draws it in memory,
 * into the box that drawing takes (`EPDFAnnot_GetDrawingRect`), which can
 * reach past `/Rect`; nothing is written. One PDFium can draw only by
 * generating an appearance into the file has no raster. Each bitmap is sized
 * to its box at the scale the page has at `options.viewport`. The shared
 * raster helper handles PDFium's display matrix convention, so this reader
 * stays in normalized PDF page coordinates.
 */
export class AnnotationAppearanceReader {
  constructor(
    private readonly runtime: PdfRuntimeModule,
    private readonly session: DocumentSession,
  ) {}

  /**
   * The page loads in slices when it isn't parsed, and the loop pauses between
   * annotations once a slice's budget is spent, so an abort stops it at either.
   */
  async render(
    pageObjectNumber: PageObjectNumber,
    family: AnnotationFamily,
    options: AnnotationAppearanceRenderOptions,
    signal: AbortSignal,
    slices: Slices,
  ): Promise<AnnotationAppearancesResult<PdfCoordinates>> {
    throwIfAborted(signal);
    const { fn, mem } = this.runtime;
    const pool = this.session.pagePool();
    const pagePtr = await pool.acquireInSlices(pageObjectNumber, signal, slices);

    const rotation = (options.rotation ?? 0) as PdfRotation;
    const modes = resolveModes(options.modes);
    const docPtr = this.session.requireDocPtr();
    const pageRef = toPageRef(pageObjectNumber);

    const appearances: AnnotationAppearanceRaster<PdfCoordinates>[] = [];

    try {
      const page = readPageBox(this.runtime, pagePtr);
      const scale = viewportScale(
        options.viewport,
        { width: page.right - page.left, height: page.top - page.bottom },
        rotation,
      );
      const count = fn.FPDFPage_GetAnnotCount(pagePtr);
      const timer = new SliceTimer(slices, signal);
      for (let i = 0; i < count; i++) {
        if (timer.due) await timer.pause();
        throwIfAborted(signal);
        const annotPtr = fn.FPDFPage_GetAnnot(pagePtr, i);
        if (!annotPtr) continue;

        try {
          const subtypeCode = fn.FPDFAnnot_GetSubtype(annotPtr);
          if (familyOfCode(subtypeCode) !== family) continue;
          const available = fn.EPDFAnnot_GetAvailableAppearanceModes(annotPtr);
          // With no normal appearance stored, where the engine draws one in memory.
          const drawn = available & NORMAL.bit ? null : readDrawingRect(fn, mem, annotPtr);
          if (!available && !drawn) continue;

          const ref = annotationRefOf(fn, mem, docPtr, pageRef, annotPtr, i);
          // Rotation-stripped rendering (`pdfAppearanceTurnOf`, the rule the
          // viewer mirrors from the DTO): a box kind drawn turned
          // (`readAnnotationTurn`: ours, a stamp Acrobat turned, a text box
          // Acrobat turned a quarter) whose drawing stays inside the turned
          // box renders turned back upright, `rect` its box; the DTO's
          // `rotation` (the same read) is the consumer's view transform.
          // Everything else renders as the page shows it, placed by `/Rect`.
          // Normalize once at the read boundary — the wire `rect` and the
          // render matrix both rely on the normalized invariant.
          const pageRect = normalizePdfRect(readAnnotRect(fn, mem, annotPtr));
          const turn = readAnnotationTurn(fn, mem, annotPtr);
          const stripped =
            turn &&
            pdfAppearanceTurnOf({
              subtype: subtypeFromCode(subtypeCode),
              rect: pageRect,
              box: turn.box,
              rotation: turn.rotation,
              intent:
                subtypeCode === ANNOT_SUBTYPE_FREETEXT
                  ? freeTextIntentFromName(readIntent(fn, mem, annotPtr))
                  : null,
            }) !== null
              ? turn
              : undefined;
          const rect = stripped ? normalizePdfRect(stripped.box) : pageRect;

          for (const mode of modes) {
            const stored = !!(available & mode.bit);
            const box = stored ? rect : mode === NORMAL ? drawn : null;
            if (!box) continue;
            const states = stored ? statesOf(fn, mem, annotPtr, mode.modeInt) : SHOWN_ONLY;
            for (const state of states) {
              const raster = this.renderOne(
                pagePtr,
                annotPtr,
                mode.modeInt,
                state.draw,
                box,
                page,
                rotation,
                scale,
                stored ? stripped : undefined,
                options.maxOutputPixels,
              );
              if (!raster) continue;
              appearances.push({
                ref,
                mode: mode.name,
                state: state.label,
                rect: box,
                raster,
              });
            }
          }
        } finally {
          fn.FPDFPage_CloseAnnot(annotPtr);
        }
      }

      return { page: pageRef, appearances };
    } finally {
      pool.release(pageObjectNumber);
    }
  }

  /**
   * Render a single annotation appearance into its own raster, sized to
   * `rect`: the stored appearance, or the one PDFium draws in memory. Returns
   * `null` when the render fails.
   */
  private renderOne(
    pagePtr: Ptr,
    annotPtr: Ptr,
    modeInt: number,
    state: string,
    rect: PdfRect,
    page: PdfRect,
    rotation: PdfRotation,
    scale: number,
    turn: AnnotationTurn | undefined,
    maxOutputPixels?: number,
  ): PageRaster | null {
    const { fn } = this.runtime;

    // Safety clamp — an engine invariant, not an option: no single appearance
    // raster exceeds APPEARANCE_PIXEL_CLAMP output pixels. Appearance size is
    // `rect × scale`, and rects span orders of magnitude — a page-sized stamp
    // at a deep-zoom scale would ask for gigabytes and OOM the wasm heap
    // (observed: a ~600pt annotation at scale ~47 → 3.3 GB malloc). The clamp
    // reduces the effective scale for that appearance instead of rejecting:
    // the raster still covers the same rect, so the consumer's box-stretch
    // shows it slightly soft rather than missing — bounded memory with
    // graceful degradation. `options.maxOutputPixels` (the deployment budget,
    // reject semantics) still applies after it, unchanged.
    const rectArea = Math.max(1, (rect.right - rect.left) * (rect.top - rect.bottom));
    const effScale = Math.min(scale, Math.sqrt(APPEARANCE_PIXEL_CLAMP / rectArea));

    // `rect` is already normalized at the read boundary; `rasterize` handles the
    // degenerate-rect / device-size / matrix / bitmap lifecycle. We supply only
    // the annotation draw (transparent background — appearances composite over
    // page content).
    return rasterize(this.runtime, {
      rect,
      page,
      rotation,
      viewport: { kind: 'scale', scale: effScale },
      ...(maxOutputPixels !== undefined ? { maxOutputPixels } : {}),
      background: 'transparent',
      // A box kind drawn turned renders turned back upright into its own box
      // (`rect`) — the consumer re-applies the DTO's `rotation` as a view
      // transform. The fork takes the turn the read found, in the file's
      // counterclockwise angle.
      draw: (bitmapPtr, matrixPtr) =>
        turn
          ? withScratch(this.runtime.mem, RECTF_BYTES, (boxPtr) => {
              writeRectF(this.runtime.mem, boxPtr, turn.box);
              return fn.EPDF_RenderAnnotBitmapUnrotated(
                bitmapPtr,
                pagePtr,
                annotPtr,
                modeInt,
                state,
                pdfFromClockwise(turn.rotation),
                boxPtr,
                matrixPtr,
                FPDF_REVERSE_BYTE_ORDER,
              );
            })
          : fn.EPDF_RenderAnnotBitmap(
              bitmapPtr,
              pagePtr,
              annotPtr,
              modeInt,
              state,
              matrixPtr,
              FPDF_REVERSE_BYTE_ORDER,
            ),
    });
  }
}

/** The normal appearance (`/AP /N`): the one PDFium draws in memory when the file has none. */
const NORMAL = APPEARANCE_MODES[0]!;

/**
 * Where PDFium draws the annotation's normal appearance in memory, in the
 * file's coordinates; `null` when it can't without writing one.
 */
function readDrawingRect(fn: PdfFunctions, mem: PdfRuntimeMemory, annotPtr: Ptr): PdfRect | null {
  return withScratch(mem, RECTF_BYTES, (buf) =>
    fn.EPDFAnnot_GetDrawingRect(annotPtr, NORMAL.modeInt, buf)
      ? normalizePdfRect(readRectF(mem, buf))
      : null,
  );
}

/** The modes a request asks for: every mode unless it names some (`appearanceModesOf`). */
function resolveModes(
  requested: AnnotationAppearanceMode[] | undefined,
): ReadonlyArray<(typeof APPEARANCE_MODES)[number]> {
  const asked = appearanceModesOf(requested);
  return asked ? APPEARANCE_MODES.filter((mode) => asked.includes(mode.name)) : APPEARANCE_MODES;
}

/**
 * At most this many states of one mode are rendered; past it, only the one
 * the annotation shows. Check boxes and radio buttons have two.
 */
const MAX_STATES = 8;

/**
 * One image to render for a mode: the state to draw (`''`: the one `/AS`
 * selects) and the state the image is labelled with.
 */
interface StateToRender {
  readonly draw: string;
  readonly label: string | null;
}

/** A mode that is a single appearance, or drawn in memory: one image, no state. */
const SHOWN_ONLY: readonly StateToRender[] = [{ draw: '', label: null }];

/**
 * The images to render for a stored mode: one per state it stores, so a
 * caller has every look of a check box whatever it shows now; one, with no
 * state, for a single appearance; only the shown state when there are more
 * than {@link MAX_STATES}.
 */
function statesOf(
  fn: PdfFunctions,
  mem: PdfRuntimeMemory,
  annotPtr: Ptr,
  modeInt: number,
): readonly StateToRender[] {
  const names = readAppearanceStateNames(fn, mem, annotPtr, modeInt);
  if (names.length === 0) return SHOWN_ONLY;
  if (names.length > MAX_STATES) {
    return [{ draw: '', label: readAppearanceState(fn, mem, annotPtr) }];
  }
  return names.map((name) => ({ draw: name, label: name }));
}

/**
 * The scale the page has at `viewport`, as a full-page render would use it:
 * a `scale` viewport's own, or a `width` viewport's width over the width of
 * the page as `rotation` turns it.
 */
function viewportScale(
  viewport: PageRenderViewport | undefined,
  page: { width: number; height: number },
  rotation: PdfRotation,
): number {
  if (viewport === undefined || viewport.kind === 'scale') return normalizeScale(viewport?.scale);
  const pageWidth = rotation === 90 || rotation === 270 ? page.height : page.width;
  if (!Number.isFinite(viewport.width) || viewport.width <= 0 || !(pageWidth > 0)) {
    throw new EngineError(EngineErrorCode.InvalidArg, 'render viewport width must be positive');
  }
  return viewport.width / pageWidth;
}

function normalizeScale(scale: number | undefined): number {
  if (scale === undefined) return 1;
  if (!Number.isFinite(scale) || scale <= 0) return 1;
  return scale;
}
