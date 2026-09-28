import type {
  AnnotationAppearanceMode,
  AnnotationAppearanceRaster,
  AnnotationAppearanceRenderOptions,
  AnnotationAppearancesResult,
  PageObjectNumber,
  PageRaster,
  PageRenderViewport,
  PdfRect,
  PdfRotation,
} from '@embedpdf/engine-core/runtime';
import {
  appearanceTurnOf,
  EngineError,
  EngineErrorCode,
  normalizePdfRect,
  subtypeFromCode,
} from '@embedpdf/engine-core/runtime';
import type { PdfRuntimeModule, Ptr } from '@embedpdf/engine-runtime';

import { freeTextIntentFromName } from './internal/freeTextIntent';
import type { DocumentSession } from '../../document-session/DocumentSession';
import { withScratch } from '../../runtime/memory/scratch';
import { RECTF_BYTES, writeRectF } from '../../runtime/memory/structs';
import { FPDF_REVERSE_BYTE_ORDER, rasterize, readPageBox } from '../render/deviceRaster';
import { readAnnotRect, readIntent } from './internal/read/annotationReadPrimitives';
import { readAnnotationIdentity } from './internal/read/readAnnotationIdentity';
import { pdfFromClockwise } from './internal/read/readAnnotationTransformMetadata';
import { throwIfAborted } from '../../shared/abort';
import { readAnnotationTurn, type AnnotationTurn } from './internal/read/readAnnotationTurn';

/** `FPDF_ANNOT_WIDGET` — form-field annotation subtype code. */
const ANNOT_SUBTYPE_WIDGET = 20;

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
 * Batch-renders the appearance streams (`/AP`) of every annotation on a page,
 * one bitmap per requested mode, in PDF user space and against the
 * `PdfRuntimeModule` (`fn` + `mem`).
 *
 * Each appearance bitmap is sized to its annotation's `/Rect` at the scale
 * the page has at `options.viewport`. The shared raster helper handles PDFium's display matrix
 * convention, so this reader stays in normalized PDF page coordinates.
 */
export class AnnotationAppearanceReader {
  constructor(
    private readonly runtime: PdfRuntimeModule,
    private readonly session: DocumentSession,
  ) {}

  render(
    pageObjectNumber: PageObjectNumber,
    options: AnnotationAppearanceRenderOptions,
    signal: AbortSignal,
  ): AnnotationAppearancesResult {
    throwIfAborted(signal);
    const { fn, mem } = this.runtime;
    const pool = this.session.pagePool();
    const pagePtr = pool.acquire(pageObjectNumber);

    const rotation = (options.rotation ?? 0) as PdfRotation;
    const modes = resolveModes(options.modes);
    const revision = this.session.pageState(pageObjectNumber).revision;

    const appearances: AnnotationAppearanceRaster[] = [];

    try {
      const page = readPageBox(this.runtime, pagePtr);
      const scale = viewportScale(
        options.viewport,
        { width: page.right - page.left, height: page.top - page.bottom },
        rotation,
      );
      const count = fn.FPDFPage_GetAnnotCount(pagePtr);
      for (let i = 0; i < count; i++) {
        throwIfAborted(signal);
        const annotPtr = fn.FPDFPage_GetAnnot(pagePtr, i);
        if (!annotPtr) continue;

        try {
          const available = fn.EPDFAnnot_GetAvailableAppearanceModes(annotPtr);
          // Skip annotations without any /AP sub-dictionary.
          if (!available) continue;

          const identity = readAnnotationIdentity(fn, mem, annotPtr, pageObjectNumber, i, revision);
          // Rotation-stripped rendering (`appearanceTurnOf`, the rule the
          // viewer mirrors from the DTO): a box kind drawn turned
          // (`readAnnotationTurn`: ours, a stamp Acrobat turned, a text box
          // Acrobat turned a quarter) whose drawing stays inside the turned
          // box renders turned back upright, `rect` its box; the DTO's
          // `rotation` (the same read) is the consumer's view transform.
          // Everything else renders as the page shows it, placed by `/Rect`.
          // Normalize once at the read boundary — the wire `rect` and the
          // render matrix both rely on the normalized invariant.
          const subtypeCode = fn.FPDFAnnot_GetSubtype(annotPtr);
          const pageRect = normalizePdfRect(readAnnotRect(fn, mem, annotPtr));
          const turn = readAnnotationTurn(fn, mem, annotPtr);
          const stripped =
            turn &&
            appearanceTurnOf({
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
            if (!(available & mode.bit)) continue;
            const raster = this.renderOne(
              pagePtr,
              annotPtr,
              mode.modeInt,
              rect,
              page,
              rotation,
              scale,
              stripped,
              options.maxOutputPixels,
            );
            if (!raster) continue;
            appearances.push({
              ref: identity.ref,
              mode: mode.name,
              rect,
              raster,
            });
          }
        } finally {
          fn.FPDFPage_CloseAnnot(annotPtr);
        }
      }

      return { pageState: this.session.pageState(pageObjectNumber), appearances };
    } finally {
      pool.release(pageObjectNumber);
    }
  }

  /**
   * Render a single annotation appearance into its own raster. Returns `null`
   * when the mode has no appearance stream (after an optional form-field AP
   * generation fallback) or the render fails.
   */
  private renderOne(
    pagePtr: Ptr,
    annotPtr: Ptr,
    modeInt: number,
    rect: PdfRect,
    page: PdfRect,
    rotation: PdfRotation,
    scale: number,
    turn: AnnotationTurn | undefined,
    maxOutputPixels?: number,
  ): PageRaster | null {
    const { fn } = this.runtime;

    if (!fn.EPDFAnnot_HasAppearanceStream(annotPtr, modeInt)) {
      // Form widgets frequently ship without a baked /AP. Generate one on the
      // fly, then re-check.
      const subtype = fn.FPDFAnnot_GetSubtype(annotPtr);
      if (subtype === ANNOT_SUBTYPE_WIDGET && !fn.FPDFAnnot_HasKey(annotPtr, 'AP')) {
        fn.EPDFAnnot_GenerateFormFieldAP(annotPtr);
        if (!fn.EPDFAnnot_HasAppearanceStream(annotPtr, modeInt)) return null;
      } else {
        return null;
      }
    }

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
              matrixPtr,
              FPDF_REVERSE_BYTE_ORDER,
            ),
    });
  }
}

function resolveModes(
  requested: AnnotationAppearanceMode[] | undefined,
): ReadonlyArray<(typeof APPEARANCE_MODES)[number]> {
  if (!requested || requested.length === 0) {
    return APPEARANCE_MODES.filter((m) => m.name === 'normal');
  }
  const wanted = new Set(requested);
  return APPEARANCE_MODES.filter((m) => wanted.has(m.name));
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
