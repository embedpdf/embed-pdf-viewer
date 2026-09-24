import {
  EngineError,
  EngineErrorCode,
  sniffBinaryMetadata,
  type BinaryMetadata,
  type PdfRect,
  type StampDraft,
  type StampFit,
  type StampPatch,
  type WireAnnotationResources,
} from '@embedpdf/engine-core/runtime';
import {
  NULL_PTR,
  type PdfFunctions,
  type PdfRuntimeMemory,
  type Ptr,
} from '@embedpdf/engine-runtime';

import type { AnnotationWriteContext } from './annotationWriteContext';
import { opacityToAlpha, setAnnotOpacity, setAnnotRect } from './annotationWritePrimitives';
import { applyAnnotationBaseDraft, applyAnnotationBasePatch } from './writeAnnotationBase';
import { writeBoxTransformMetadata } from './writeAnnotationTransformMetadata';
import { EMBD_METADATA_SCHEMA_VERSION, writeEmbedMetadataString } from './writeEmbedMetadata';
import { F32_BYTES } from '../../../../runtime/memory/structs';
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
 *   2. sniff the bytes (PNG/JPEG → image object, PDF → cloned form XObject)
 *   3. `EPDFAnnot_UpdateAppearanceToRect` fits the appearance into the box
 *      honouring its `fit` and any `/EMBD_Metadata` rotation.
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
  authorStampAppearance(fn, mem, annotPtr, requireStampAppearance(ctx), fit, {
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
    authorStampAppearance(fn, mem, annotPtr, appearance, fit, {
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
  if (!(appearance instanceof ArrayBuffer) || !sniffBinaryMetadata(appearance)) {
    throw new EngineError(
      EngineErrorCode.InvalidArg,
      'the appearance resource must be PNG, JPEG or one-page PDF bytes',
    );
  }
  if (ctx?.docPtr === undefined || ctx.pagePtr === undefined) {
    throw new EngineError(
      EngineErrorCode.Unknown,
      'stamp writer requires docPtr/pagePtr on the write context',
    );
  }
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
  fit: StampFit,
  box: StampBox,
): void {
  const rotated = !!box.rotation && box.unrotatedRect !== undefined;
  if (!rotated) {
    setAnnotRect(fn, mem, annotPtr, box.rect);
    setStampContent(fn, mem, annotPtr, appearance, fit);
    return;
  }
  const unrotated = box.unrotatedRect!;
  // 1. Author in the unrotated frame — clear any rotation metadata first so the
  //    internal re-fit records an image-shaped EPDFOrigContentRect, not the AABB.
  writeBoxTransformMetadata(fn, mem, annotPtr, {});
  setAnnotRect(fn, mem, annotPtr, unrotated);
  setStampContent(fn, mem, annotPtr, appearance, fit);
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
  fit: StampFit,
): void {
  const meta = sniffBinaryMetadata(bytes);
  if (!meta) {
    throw new EngineError(EngineErrorCode.Unknown, 'stamp content preflight invariant broken');
  }

  // Replace, not merge: drop any existing appearance objects (no-op on create).
  for (let i = fn.FPDFAnnot_GetObjectCount(annotPtr) - 1; i >= 0; i--) {
    fn.FPDFAnnot_RemoveObject(annotPtr, i);
  }

  if (meta.mimeType === 'application/pdf') {
    setAppearanceFromPdfBytes(fn, mem, annotPtr, bytes);
  } else {
    setAppearanceFromImageBytes(fn, mem, annotPtr, bytes, meta);
  }

  // Normalises the AP (BBox, EPDFOrigContentRect for later re-fits) and
  // applies any /EMBD_Metadata rotation.
  refitAppearance(fn, annotPtr, fit);
}

function setStampOpacity(fn: PdfFunctions, annotPtr: Ptr, fit: StampFit, opacity: number): void {
  if (!fn.EPDFAnnot_SetStampOpacity(annotPtr, STAMP_FIT_TO_CODE[fit], opacityToAlpha(opacity))) {
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

/** Acrobat's page size limit: a drawing larger than this is scaled down to fit. */
const MAX_DRAWING_SIZE = 14_400;

/**
 * PNG or JPEG → the image at its own size, as a one-page drawing: a pixel is
 * a point, scaled down to fit {@link MAX_DRAWING_SIZE}. The drawing doesn't
 * depend on the stamp's box or fit, which the wrapper applies: a later `fit`
 * shows the whole image, and the same image is always the same drawing.
 */
function setAppearanceFromImageBytes(
  fn: PdfFunctions,
  mem: PdfRuntimeMemory,
  annotPtr: Ptr,
  bytes: ArrayBuffer,
  meta: Extract<BinaryMetadata, { width: number }>,
): void {
  const scale = Math.min(1, MAX_DRAWING_SIZE / Math.max(meta.width, meta.height));
  const width = meta.width * scale;
  const height = meta.height * scale;
  const docPtr = fn.FPDF_CreateNewDocument();
  if (!docPtr) {
    throw new EngineError(EngineErrorCode.Unknown, 'FPDF_CreateNewDocument returned NULL');
  }
  try {
    const pagePtr = fn.FPDFPage_New(docPtr, 0, width, height);
    if (!pagePtr) {
      throw new EngineError(EngineErrorCode.Unknown, 'FPDFPage_New returned NULL');
    }
    try {
      const imageObjPtr = fn.FPDFPageObj_NewImageObj(docPtr);
      if (!imageObjPtr) {
        throw new EngineError(EngineErrorCode.Unknown, 'FPDFPageObj_NewImageObj returned NULL');
      }
      let inserted = false;
      try {
        const dataPtr = mem.alloc(bytes.byteLength);
        try {
          mem.writeBytes(dataPtr, new Uint8Array(bytes));
          const ok =
            meta.mimeType === 'image/png'
              ? fn.EPDFImageObj_SetPng(NULL_PTR, 0, imageObjPtr, dataPtr, bytes.byteLength)
              : fn.EPDFImageObj_SetJpeg(NULL_PTR, 0, imageObjPtr, dataPtr, bytes.byteLength);
          if (!ok) {
            throw new EngineError(
              EngineErrorCode.InvalidArg,
              `${meta.mimeType === 'image/png' ? 'EPDFImageObj_SetPng' : 'EPDFImageObj_SetJpeg'} rejected the image data`,
            );
          }
        } finally {
          mem.free(dataPtr);
        }
        setImageMatrix(fn, mem, imageObjPtr, width, height);
        fn.FPDFPage_InsertObject(pagePtr, imageObjPtr);
        inserted = true;
      } finally {
        // The page owns the object once inserted; on failure we own it.
        if (!inserted) fn.FPDFPageObj_Destroy(imageObjPtr);
      }
      if (!fn.FPDFPage_GenerateContent(pagePtr)) {
        throw new EngineError(EngineErrorCode.Unknown, 'FPDFPage_GenerateContent returned false');
      }
      if (!fn.EPDFAnnot_SetAppearanceFromPage(annotPtr, docPtr, 0)) {
        throw new EngineError(
          EngineErrorCode.Unknown,
          'EPDFAnnot_SetAppearanceFromPage returned false',
        );
      }
    } finally {
      fn.FPDF_ClosePage(pagePtr);
    }
  } finally {
    fn.FPDF_CloseDocument(docPtr);
  }
}

/** FS_MATRIX { a, b, c, d, e, f } — six f32s. */
function setImageMatrix(
  fn: PdfFunctions,
  mem: PdfRuntimeMemory,
  imageObjPtr: Ptr,
  width: number,
  height: number,
): void {
  const buf = mem.alloc(6 * F32_BYTES);
  try {
    mem.poke(buf, 'f32', width, 0);
    mem.poke(buf, 'f32', 0, 4);
    mem.poke(buf, 'f32', 0, 8);
    mem.poke(buf, 'f32', height, 12);
    mem.poke(buf, 'f32', 0, 16);
    mem.poke(buf, 'f32', 0, 20);
    if (!fn.FPDFPageObj_SetMatrix(imageObjPtr, buf)) {
      throw new EngineError(EngineErrorCode.Unknown, 'FPDFPageObj_SetMatrix returned false');
    }
  } finally {
    mem.free(buf);
  }
}

/**
 * Single-page PDF → deep-cloned Form XObject as AP/N. The source buffer
 * must stay alive until the temp document closes.
 */
function setAppearanceFromPdfBytes(
  fn: PdfFunctions,
  mem: PdfRuntimeMemory,
  annotPtr: Ptr,
  bytes: ArrayBuffer,
): void {
  const dataPtr = mem.alloc(bytes.byteLength);
  try {
    mem.writeBytes(dataPtr, new Uint8Array(bytes));
    const tempDocPtr = fn.FPDF_LoadMemDocument(dataPtr, bytes.byteLength, '');
    if (!tempDocPtr) {
      throw new EngineError(
        EngineErrorCode.MalformedPdf,
        "the stamp's appearance PDF could not be opened",
      );
    }
    try {
      if (!fn.EPDFAnnot_SetAppearanceFromPage(annotPtr, tempDocPtr, 0)) {
        throw new EngineError(
          EngineErrorCode.Unknown,
          'EPDFAnnot_SetAppearanceFromPage returned false',
        );
      }
    } finally {
      fn.FPDF_CloseDocument(tempDocPtr);
    }
  } finally {
    mem.free(dataPtr);
  }
}
