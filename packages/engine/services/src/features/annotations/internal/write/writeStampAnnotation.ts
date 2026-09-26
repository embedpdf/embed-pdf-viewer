import {
  EngineError,
  EngineErrorCode,
  sniffBinaryMetadata,
  type PdfRect,
  type StampDraft,
  type StampFit,
  type StampPatch,
  type WireAnnotationResources,
} from '@embedpdf/engine-core/runtime';
import type { PdfFunctions, PdfRuntimeMemory, Ptr } from '@embedpdf/engine-runtime';

import type { AnnotationWriteContext } from './annotationWriteContext';
import { setAnnotOpacity, setAnnotRect } from './annotationWritePrimitives';
import { drawingFor } from './stampDrawing';
import { applyAnnotationBaseDraft, applyAnnotationBasePatch } from './writeAnnotationBase';
import { writeBoxTransformMetadata } from './writeAnnotationTransformMetadata';
import { EMBD_METADATA_SCHEMA_VERSION, writeEmbedMetadataString } from './writeEmbedMetadata';
import type { DrawingIndex } from '../../../../document-session/DrawingIndex';
import { readAnnotRect } from '../read/annotationReadPrimitives';
import { KEY_APPEARANCE_FIT, readStampFit } from '../read/readStampAnnotation';

/** `EPDF_STAMP_FIT` codes from `public/fpdf_annot.h` (CSS `object-fit` naming on the wire). */
const STAMP_FIT_TO_CODE: Record<StampFit, number> = {
  contain: 0, // EPDF_STAMP_FIT_CONTAIN
  cover: 1, // EPDF_STAMP_FIT_COVER
  fill: 2, // EPDF_STAMP_FIT_STRETCH
};

/** The stamp's drawing: the `appearance` resource that came with the write. */
type StampAppearance = NonNullable<WireAnnotationResources['appearance']>;

/**
 * Validate every caller-controlled stamp input before the mutation owner
 * performs its first native write. AnnotationMutator invokes these before
 * creating an annotation or strengthening a weak annotation id.
 */
export function preflightStampDraft(draft: StampDraft, ctx?: AnnotationWriteContext): void {
  if (draft.name != null) requireStampName(draft.name);
  if (draft.fit != null) requireStampFit(draft.fit);
  requireStampContent(ctx?.resources?.appearance, ctx);
}

export function preflightStampPatch(patch: StampPatch, ctx?: AnnotationWriteContext): void {
  if (patch.name !== undefined && patch.name !== null) requireStampName(patch.name);
  if (patch.fit != null) requireStampFit(patch.fit);
  const appearance = ctx?.resources?.appearance;
  if (appearance !== undefined) requireStampContent(appearance, ctx);
}

/**
 * Apply a stamp draft. Order mirrors the other writers (base → subtype
 * fields), then the appearance pipeline via {@link authorStampAppearance}:
 *   1. take the `appearance` resource that came with the write
 *   2. find or make its drawing ({@link drawingFor}): a stamp with the same
 *      artwork already in the document shares it
 *   3. `EPDFAnnot_SetStampDrawing` gives the stamp a wrapper of its own that
 *      fits the drawing into the box, honouring its `fit` and any
 *      `/EMBD_Metadata` rotation.
 * The mutator's `EPDFAnnot_GenerateAppearance` pass afterwards is a no-op
 * for stamps (CPDF_GenerateAP has no stamp arm), so the appearance built
 * here is what ships.
 */
export function applyStampDraft(
  fn: PdfFunctions,
  mem: PdfRuntimeMemory,
  annotPtr: Ptr,
  draft: StampDraft,
  ctx?: AnnotationWriteContext,
): void {
  applyAnnotationBaseDraft(fn, mem, annotPtr, draft);
  if (draft.name != null) {
    setStampName(fn, annotPtr, draft.name);
  }
  // Before the drawing is placed: the wrapper paints /CA, and a layer in the
  // drawing that only repeats it is left out.
  if (draft.opacity !== undefined) setAnnotOpacity(fn, annotPtr, draft.opacity);
  // A create records the fit it used. Data that records none (`null`, as a
  // stamp another tool made reads) is fit as such a stamp is shown: `fill`.
  const fit = draft.fit === null ? 'fill' : (draft.fit ?? 'contain');
  const appearance = requireStampAppearance(ctx);
  authorStampAppearance(fn, mem, annotPtr, appearance, requireDrawingTarget(ctx), fit, {
    rect: draft.rect,
    // The appearance author wants values-or-absent; a tri-state `null`
    // (no rotation) authors the same as an omitted field.
    unrotatedRect: draft.unrotatedRect ?? undefined,
    rotation: draft.rotation ?? undefined,
  });
  if (draft.fit !== null) writeStampFit(fn, mem, annotPtr, fit);
}

export function applyStampPatch(
  fn: PdfFunctions,
  mem: PdfRuntimeMemory,
  annotPtr: Ptr,
  patch: StampPatch,
  ctx?: AnnotationWriteContext,
): void {
  applyAnnotationBasePatch(fn, mem, annotPtr, patch);
  if (patch.name === null) {
    // Removal is the generic key removal — the reader then reports the
    // spec default; the appearance (the artwork) is untouched.
    fn.EPDFAnnot_RemoveKey(annotPtr, 'Name');
  } else if (patch.name !== undefined) {
    setStampName(fn, annotPtr, patch.name);
  }
  // The fit the drawing is (re-)fit with: the patch's, else the recorded one,
  // else `fill`, the way a PDF places any appearance in its /Rect.
  const recordedFit = readStampFit(fn, mem, annotPtr) ?? 'fill';
  const fit = patch.fit !== undefined ? (patch.fit ?? 'fill') : recordedFit;
  if (patch.fit !== undefined) writeStampFit(fn, mem, annotPtr, patch.fit);
  const appearance = ctx?.resources?.appearance;
  if (appearance !== undefined) {
    // New bytes replace the drawing, so they only need the new value.
    if (patch.opacity !== undefined) setAnnotOpacity(fn, annotPtr, patch.opacity);
    // Content replacement: rebuild the appearance from the new bytes, authored
    // in the unrotated frame (see authorStampAppearance) so a rotated stamp
    // never double-fits into its padded AABB.
    const rect = patch.rect ?? readAnnotRect(fn, mem, annotPtr);
    authorStampAppearance(fn, mem, annotPtr, appearance, requireDrawingTarget(ctx), fit, {
      rect,
      unrotatedRect: patch.unrotatedRect ?? undefined,
      rotation: patch.rotation ?? undefined,
    });
    return;
  }
  // No new bytes: geometry / rotation only.
  if (patch.rect !== undefined) {
    setAnnotRect(fn, mem, annotPtr, patch.rect);
  }
  // Transform metadata is tri-state per field (undefined preserves, null/0
  // clears, value sets) — a rect-only re-position keeps the rotation, and
  // rotate-back-to-0 is stated explicitly (`rotation: null`/`0`) by the
  // emitter rather than implied by omission.
  writeBoxTransformMetadata(fn, mem, annotPtr, {
    rotation: patch.rotation,
    unrotatedRect: patch.unrotatedRect,
  });
  if (patch.opacity !== undefined) {
    // The appearance still paints the old /CA; the native side reads it with
    // that value, so its opacity layer is replaced, not kept as drawing. It
    // re-fits into the new /Rect too.
    setStampOpacity(fn, annotPtr, fit, patch.opacity);
  } else if (
    patch.rect !== undefined ||
    patch.fit !== undefined ||
    patch.rotation !== undefined ||
    patch.unrotatedRect !== undefined
  ) {
    // Geometry-only patch: re-fit the existing appearance into the new /Rect.
    refitAppearance(fn, annotPtr, fit);
  }
}

export function isStampSubtype(subtype: string): subtype is 'stamp' {
  return subtype === 'stamp';
}

/** Record how the drawing fills the box; `null` removes the record. */
function writeStampFit(
  fn: PdfFunctions,
  mem: PdfRuntimeMemory,
  annotPtr: Ptr,
  fit: StampFit | null,
): void {
  if (fit === null) {
    fn.EPDFAnnot_ClearEmbedMetadataKey(annotPtr, KEY_APPEARANCE_FIT);
    return;
  }
  if (!fn.EPDFAnnot_HasEmbedMetadata(annotPtr)) {
    fn.EPDFAnnot_SetEmbedMetadataNumber(annotPtr, 'SchemaVersion', EMBD_METADATA_SCHEMA_VERSION);
  }
  writeEmbedMetadataString(fn, mem, annotPtr, KEY_APPEARANCE_FIT, fit);
}

/** Any non-empty name: standard ('Approved') or custom ('#LBGiYhk8V…') —
 *  the fork writes a name object and escapes it; predefined sets are a
 *  reader concern (ISO 32000-2 table 187 allows additional names). */
function setStampName(fn: PdfFunctions, annotPtr: Ptr, name: string): void {
  if (!fn.EPDFAnnot_SetName(annotPtr, name)) {
    throw new EngineError(EngineErrorCode.Unknown, 'EPDFAnnot_SetName returned false');
  }
}

function requireStampName(name: string): void {
  if (name.length === 0) {
    throw new EngineError(EngineErrorCode.InvalidArg, 'stamp name must be non-empty');
  }
}

function requireStampFit(fit: StampFit): void {
  if (STAMP_FIT_TO_CODE[fit] === undefined) {
    throw new EngineError(
      EngineErrorCode.InvalidArg,
      `unknown stamp fit '${String(fit)}'; expected contain, cover, or fill`,
    );
  }
}

function requireStampAppearance(ctx: AnnotationWriteContext | undefined): StampAppearance {
  const appearance = ctx?.resources?.appearance;
  if (!appearance) {
    throw new EngineError(
      EngineErrorCode.InvalidArg,
      "creating a stamp annotation needs its 'appearance' resource",
    );
  }
  return appearance;
}

function requireStampContent(
  appearance: StampAppearance | undefined,
  ctx: AnnotationWriteContext | undefined,
): void {
  if (!appearance) requireStampAppearance(ctx);
  const meta = appearance instanceof ArrayBuffer ? sniffBinaryMetadata(appearance) : null;
  if (!meta) {
    throw new EngineError(
      EngineErrorCode.InvalidArg,
      'the appearance resource must be PNG, JPEG or one-page PDF bytes',
    );
  }
  if (meta.mimeType === 'application/pdf') {
    const pages = ctx?.pdfPageCount?.(appearance as ArrayBuffer);
    if (pages === null) {
      throw new EngineError(
        EngineErrorCode.MalformedPdf,
        "the stamp's appearance PDF could not be opened",
      );
    }
    if (pages !== undefined && pages !== 1) {
      throw new EngineError(
        EngineErrorCode.InvalidArg,
        `the appearance PDF has ${pages} pages; a stamp takes a one-page PDF`,
      );
    }
  }
  requireDrawingTarget(ctx);
}

/** Where a stamp's drawing is found or added: the document and its drawings. */
interface DrawingTarget {
  docPtr: Ptr;
  drawings: DrawingIndex;
}

function requireDrawingTarget(ctx: AnnotationWriteContext | undefined): DrawingTarget {
  if (ctx?.docPtr === undefined || !ctx.drawings) {
    throw new EngineError(
      EngineErrorCode.Unknown,
      'stamp writer requires docPtr/drawings on the write context',
    );
  }
  return { docPtr: ctx.docPtr, drawings: ctx.drawings };
}

/** The box transform a stamp draft/patch carries (the box-kind rotation split). */
interface StampBox {
  /** `/Rect` — the rotated visual AABB when rotated; the box itself otherwise. */
  rect: PdfRect;
  /** The logical (pre-rotation) box; present only alongside a non-zero rotation. */
  unrotatedRect?: PdfRect;
  /** `/EMBD_Metadata/Rotation` (deg, PDF convention). */
  rotation?: number;
}

/**
 * Author a stamp's appearance from its `appearance` resource, correct under rotation.
 *
 * The appearance must be built in the unrotated frame and rotated by an
 * `/AP /Matrix` afterwards — the "FreeText pattern" the stamp draft documents.
 * If instead the image is fit into the rotated AABB `/Rect` (a portrait box for
 * a landscape image, say), the letterboxed bands get baked into the appearance,
 * and the closing native re-fit — which records `EPDFOrigContentRect` from that
 * padded box and then fits it into the unrotated box — shrinks the image by the
 * aspect ratio a second time. The result is a small image adrift in white
 * padding, and only when rotated (at 0° the two frames coincide, so it fills).
 *
 * So for a rotated stamp we: author the image into the unrotated box with no
 * rotation metadata active (its recorded `EPDFOrigContentRect` is the
 * image-filled logical box), then write the rotation metadata, set the real
 * AABB `/Rect`, and re-fit once — which bakes the `/Matrix` and leaves the
 * appearance filling the box exactly as the 0° case does. The unrotated path is
 * unchanged: author straight into `/Rect`.
 */
function authorStampAppearance(
  fn: PdfFunctions,
  mem: PdfRuntimeMemory,
  annotPtr: Ptr,
  appearance: StampAppearance,
  target: DrawingTarget,
  fit: StampFit,
  box: StampBox,
): void {
  const rotated = !!box.rotation && box.unrotatedRect !== undefined;
  if (!rotated) {
    setAnnotRect(fn, mem, annotPtr, box.rect);
    setStampContent(fn, mem, annotPtr, appearance, target, fit);
    return;
  }
  const unrotated = box.unrotatedRect!;
  // 1. Author in the unrotated frame — clear any rotation metadata first so the
  //    internal re-fit records an image-shaped EPDFOrigContentRect, not the AABB.
  writeBoxTransformMetadata(fn, mem, annotPtr, {});
  setAnnotRect(fn, mem, annotPtr, unrotated);
  setStampContent(fn, mem, annotPtr, appearance, target, fit);
  // 2. Apply the transform: metadata bakes the /Matrix, /Rect becomes the AABB,
  //    and one re-fit reconciles BBox + Matrix from the now-recorded content.
  writeBoxTransformMetadata(fn, mem, annotPtr, {
    rotation: box.rotation,
    unrotatedRect: unrotated,
  });
  setAnnotRect(fn, mem, annotPtr, box.rect);
  refitAppearance(fn, annotPtr, fit);
}

function setStampContent(
  fn: PdfFunctions,
  mem: PdfRuntimeMemory,
  annotPtr: Ptr,
  bytes: ArrayBuffer,
  target: DrawingTarget,
  fit: StampFit,
): void {
  const meta = sniffBinaryMetadata(bytes);
  if (!meta) {
    throw new EngineError(EngineErrorCode.Unknown, 'stamp content preflight invariant broken');
  }
  // A new wrapper places the drawing: the old appearance is replaced whole,
  // nothing of it stays reachable in the saved file, and a drawing other
  // stamps place is never changed.
  const drawing = drawingFor(fn, mem, target.docPtr, target.drawings, bytes, meta);
  if (!fn.EPDFAnnot_SetStampDrawing(annotPtr, drawing, STAMP_FIT_TO_CODE[fit])) {
    throw new EngineError(EngineErrorCode.Unknown, 'EPDFAnnot_SetStampDrawing returned false');
  }
}

function setStampOpacity(fn: PdfFunctions, annotPtr: Ptr, fit: StampFit, opacity: number): void {
  if (!fn.EPDFAnnot_SetStampOpacity(annotPtr, STAMP_FIT_TO_CODE[fit], opacity)) {
    throw new EngineError(EngineErrorCode.Unknown, 'EPDFAnnot_SetStampOpacity returned false');
  }
}

function refitAppearance(fn: PdfFunctions, annotPtr: Ptr, fit: StampFit): void {
  if (!fn.EPDFAnnot_UpdateAppearanceToRect(annotPtr, STAMP_FIT_TO_CODE[fit])) {
    throw new EngineError(
      EngineErrorCode.Unknown,
      'EPDFAnnot_UpdateAppearanceToRect returned false',
    );
  }
}
