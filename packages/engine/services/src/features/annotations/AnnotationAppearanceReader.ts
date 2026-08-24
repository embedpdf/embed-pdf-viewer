import type {
  AnnotationAppearanceMode,
  AnnotationAppearanceRaster,
  AnnotationAppearanceRenderOptions,
  AnnotationAppearancesResult,
  PageObjectNumber,
  PageRaster,
  PdfRect,
  PdfRotation,
} from '@embedpdf/engine-core/runtime';
import { normalizePdfRect } from '@embedpdf/engine-core/runtime';
import type { PdfRuntimeModule, Ptr } from '@embedpdf/engine-runtime';

import type { DocumentSession } from '../../document-session/DocumentSession';
import { throwIfAborted } from '../../shared/abort';
import { FPDF_REVERSE_BYTE_ORDER, rasterize } from '../render/deviceRaster';
import { readAnnotRect, readIntent } from './internal/read/annotationReadPrimitives';
import { readAnnotationIdentity } from './internal/read/readAnnotationIdentity';
import {
  readAnnotationRotation,
  readAnnotationUnrotatedRect,
} from './internal/read/readAnnotationTransformMetadata';
import { freeTextIntentFromName } from './internal/freeTextIntent';

/** `FPDF_ANNOT_WIDGET` — form-field annotation subtype code. */
const ANNOT_SUBTYPE_WIDGET = 20;

/** `FPDF_ANNOT_FREETEXT` — free-text annotation subtype code. */
const ANNOT_SUBTYPE_FREETEXT = 3;

/**
 * BOX-family subtypes (free-text 3, square 5, circle 6, stamp 13, caret 14):
 * the kinds whose v3 writers put rotation in the AP `/Matrix` +
 * `/EMBD_Metadata` `/UnrotatedRect`. Only these are eligible for
 * rotation-stripped appearance rendering — vertex kinds
 * (line/polyline/polygon/ink) pre-rotate their geometry, so their rasters must
 * stay on the classic path. This set MUST cover every kind whose reader
 * surfaces the rotation pair: `fromDTO` (plugin-annotation repository) mirrors
 * this exact condition to re-apply the stripped rotation as `apRot`.
 */
const BOX_FAMILY_SUBTYPES: ReadonlySet<number> = new Set([3, 5, 6, 13, 14]);

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
 * one bitmap per requested mode. Ported from the v2 PDFium engine's
 * `renderPageAnnotationsRaw` / `renderSingleAnnotAppearance`, but expressed in
 * PDF user space and against the `PdfRuntimeModule` (`fn` + `mem`).
 *
 * Each appearance bitmap is sized to its annotation's `/Rect` scaled by
 * `options.scale`. The shared raster helper handles PDFium's display matrix
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

    const scale = normalizeScale(options.scale);
    const rotation = (options.rotation ?? 0) as PdfRotation;
    const modes = resolveModes(options.modes);
    const revision = this.session.pageState(pageObjectNumber).revision;

    const appearances: AnnotationAppearanceRaster[] = [];

    try {
      const page = {
        width: fn.FPDF_GetPageWidthF(pagePtr),
        height: fn.FPDF_GetPageHeightF(pagePtr),
      };
      const count = fn.FPDFPage_GetAnnotCount(pagePtr);
      for (let i = 0; i < count; i++) {
        throwIfAborted(signal);
        const annotPtr = fn.FPDFPage_GetAnnot(pagePtr, i);
        if (!annotPtr) continue;

        try {
          const available = fn.EPDFAnnot_GetAvailableAppearanceModes(annotPtr);
          // Skip annotations without any /AP sub-dictionary. Mirrors v2.
          if (!available) continue;

          const identity = readAnnotationIdentity(fn, mem, annotPtr, pageObjectNumber, i, revision);
          // Rotation-stripped rendering (see AnnotationRender.ts) applies ONLY
          // where the rotation demonstrably lives in the AP Matrix: a BOX-family
          // kind carrying BOTH `/EMBD_Metadata` `/Rotation` and `/UnrotatedRect`.
          // There the raster renders flat, `rect` is the logical unrotated box,
          // and the DTO's `rotation` (same two fields, surfaced by the box
          // readers) is the consumer's view transform. Everything else — vertex
          // kinds (rotation pre-baked into their geometry), foreign PDFs with
          // arbitrary AP matrices — renders on the classic path, placed by
          // `/Rect`, bit-identical to before.
          // A free-text CALLOUT is excluded even with both fields present: only
          // its text box tilts, via an INLINE `cm` mid-stream (the leader stays
          // page-space), so the form `/Matrix` is identity — nothing to strip.
          const subtypeCode = fn.FPDFAnnot_GetSubtype(annotPtr);
          const isCallout =
            subtypeCode === ANNOT_SUBTYPE_FREETEXT &&
            freeTextIntentFromName(readIntent(fn, mem, annotPtr)) === 'free-text-callout';
          const stripRotation =
            BOX_FAMILY_SUBTYPES.has(subtypeCode) &&
            !isCallout &&
            readAnnotationRotation(fn, mem, annotPtr) !== undefined;
          const unrotatedRect = stripRotation
            ? readAnnotationUnrotatedRect(fn, mem, annotPtr)
            : undefined;
          // Normalize once at the read boundary — the wire `rect` and the render
          // matrix both rely on the normalized invariant.
          const rect = normalizePdfRect(unrotatedRect ?? readAnnotRect(fn, mem, annotPtr));

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
              unrotatedRect !== undefined,
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
    page: { width: number; height: number },
    rotation: PdfRotation,
    scale: number,
    stripRotation: boolean,
    maxOutputPixels?: number,
  ): PageRaster | null {
    const { fn } = this.runtime;

    if (!fn.EPDFAnnot_HasAppearanceStream(annotPtr, modeInt)) {
      // Form widgets frequently ship without a baked /AP. Generate one on the
      // fly (same fallback as the v2 engine), then re-check.
      const subtype = fn.FPDFAnnot_GetSubtype(annotPtr);
      if (subtype === ANNOT_SUBTYPE_WIDGET && !fn.FPDFAnnot_HasKey(annotPtr, 'AP')) {
        fn.EPDFAnnot_GenerateFormFieldAP(annotPtr);
        if (!fn.EPDFAnnot_HasAppearanceStream(annotPtr, modeInt)) return null;
      } else {
        return null;
      }
    }

    // SAFETY CLAMP — an engine invariant, not an option: no single appearance
    // raster exceeds APPEARANCE_PIXEL_CLAMP output pixels. Appearance size is
    // `rect × scale`, and rects span orders of magnitude — a page-sized stamp
    // at a deep-zoom scale would ask for gigabytes and OOM the wasm heap
    // (observed: a ~600pt annotation at scale ~47 → 3.3 GB malloc). The clamp
    // REDUCES the effective scale for that appearance instead of rejecting:
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
      // `stripRotation` (EmbedPDF box-kind rotation only): render the AP form
      // content WITHOUT its rotation Matrix, MatchRect-mapped to the unrotated
      // box — the consumer re-applies the DTO's `rotation` as a view transform.
      draw: (bitmapPtr, matrixPtr) =>
        (stripRotation ? fn.EPDF_RenderAnnotBitmapUnrotated : fn.EPDF_RenderAnnotBitmap)(
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

function normalizeScale(scale: number | undefined): number {
  if (scale === undefined) return 1;
  if (!Number.isFinite(scale) || scale <= 0) return 1;
  return scale;
}
