import {
  EngineError,
  EngineErrorCode,
  sniffBinaryMetadata,
  type InkDraft,
  type InkPatch,
  type PdfCoordinates,
} from '@embedpdf/engine-core/runtime';
import type { PdfFunctions, PdfRuntimeMemory, Ptr } from '@embedpdf/engine-runtime';

import type { AnnotationWriteContext } from './annotationWriteContext';
import { setInkList, setIntent, setIntentOrClear } from './annotationWritePrimitives';
import { applyAnnotationBaseDraft, applyAnnotationBasePatch } from './writeAnnotationBase';
import { readCurrentPoints, updatePoints, writeNewPoints } from './writeAnnotationPoints';
import { applyGeometryStyleDraft, applyGeometryStylePatch } from './writeStyle';
import { inkIntentToName } from '../inkIntent';

/**
 * Apply an ink draft to a freshly-created annotation. Ink has a stroke but
 * no `/IC`, so it uses the geometry styling layer (not the filled one).
 * Order:
 *   1. base author-metadata (contents/nm)
 *   2. geometry styling (/C, /CA, /BS, dash)
 *   3. /InkList freehand strokes, turned by `rotation`
 *      (`writeAnnotationPoints`); the appearance then sets /Rect to what it
 *      paints
 */
export function applyInkDraft(
  fn: PdfFunctions,
  mem: PdfRuntimeMemory,
  annotPtr: Ptr,
  draft: InkDraft<PdfCoordinates>,
): void {
  applyAnnotationBaseDraft(fn, mem, annotPtr, draft);
  if (draft.intent != null) setIntent(fn, annotPtr, inkIntentToName(draft.intent));
  applyGeometryStyleDraft(fn, mem, annotPtr, draft);
  setInkList(
    fn,
    mem,
    annotPtr,
    writeNewPoints(fn, mem, annotPtr, draft.inkList, draft.rotation).drawn,
  );
}

export function applyInkPatch(
  fn: PdfFunctions,
  mem: PdfRuntimeMemory,
  annotPtr: Ptr,
  patch: InkPatch<PdfCoordinates>,
): void {
  applyAnnotationBasePatch(fn, mem, annotPtr, patch);
  if (patch.intent !== undefined) {
    setIntentOrClear(fn, annotPtr, patch.intent === null ? null : inkIntentToName(patch.intent));
  }
  applyGeometryStylePatch(fn, mem, annotPtr, patch);
  const placed = updatePoints(
    fn,
    mem,
    annotPtr,
    readCurrentPoints(fn, mem, annotPtr),
    patch.inkList,
    patch.rotation,
  );
  if (placed) setInkList(fn, mem, annotPtr, placed.drawn);
}

/**
 * Type-narrowing predicate used by the writer registry to pick the ink
 * writer for a draft/patch's `subtype`.
 */
export function isInkSubtype(subtype: string): subtype is 'ink' {
  return subtype === 'ink';
}

/**
 * Validate an ink's `appearance` resource before the first native write: it
 * must be a one-page PDF (a drawing, not a picture of one).
 */
export function preflightInkAppearance(ctx: AnnotationWriteContext | undefined): void {
  const appearance = ctx?.resources?.appearance;
  if (appearance === undefined) return;
  const meta = sniffBinaryMetadata(appearance);
  if (meta?.mimeType !== 'application/pdf') {
    throw new EngineError(
      EngineErrorCode.InvalidArg,
      "an ink's appearance resource must be one-page PDF bytes",
    );
  }
  const pages = ctx?.pdfPageCount?.(appearance);
  if (pages === null) {
    throw new EngineError(
      EngineErrorCode.MalformedPdf,
      "the ink's appearance PDF could not be opened",
    );
  }
  if (pages !== undefined && pages !== 1) {
    throw new EngineError(
      EngineErrorCode.InvalidArg,
      `the appearance PDF has ${pages} pages; an ink takes a one-page PDF`,
    );
  }
}

/**
 * Draw an ink's normal appearance from its `appearance` resource: a
 * one-page PDF whose page is the drawing (smoothed strokes, say, where the
 * generator joins `/InkList` points with straight segments). Runs after the
 * generator has set `/Rect` from the strokes; the page fills that rect, so
 * a caller that draws into the box the strokes span (half the line width
 * around their points) gets its drawing where its points are. `false` when
 * the write carried no appearance.
 */
export function drawInkAppearance(
  fn: PdfFunctions,
  mem: PdfRuntimeMemory,
  annotPtr: Ptr,
  ctx: AnnotationWriteContext | undefined,
): boolean {
  const appearance = ctx?.resources?.appearance;
  if (appearance === undefined) return false;
  const bytes = new Uint8Array(appearance);
  const dataPtr = mem.alloc(bytes.byteLength);
  let artworkPtr: Ptr | null = null;
  try {
    mem.writeBytes(dataPtr, bytes);
    artworkPtr = fn.FPDF_LoadMemDocument64(dataPtr, bytes.byteLength, '');
    if (!artworkPtr) {
      throw new EngineError(
        EngineErrorCode.MalformedPdf,
        "the ink's appearance PDF could not be opened",
      );
    }
    if (!fn.EPDFAnnot_SetAppearanceFromPage(annotPtr, artworkPtr, 0)) {
      throw new EngineError(
        EngineErrorCode.InvalidArg,
        'the appearance page could not be drawn into the ink',
      );
    }
    return true;
  } finally {
    if (artworkPtr) fn.FPDF_CloseDocument(artworkPtr);
    mem.free(dataPtr);
  }
}
