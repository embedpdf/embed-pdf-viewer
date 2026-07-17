import {
  EngineError,
  EngineErrorCode,
  type WireAnnotationDraft,
  type WireAnnotationPatch,
} from '@embedpdf/engine-core/runtime';
import type {
  CaretDraft,
  CaretPatch,
  WidgetDraft,
  WidgetPatch,
  FreeTextDraft,
  FreeTextPatch,
  InkDraft,
  InkPatch,
  LineDraft,
  LinePatch,
  LinkDraft,
  LinkPatch,
  PolygonDraft,
  PolygonPatch,
  PolylineDraft,
  PolylinePatch,
  StampWireDraft,
  StampWirePatch,
  TextDraft,
  TextPatch,
  FileAttachmentWireDraft,
  FileAttachmentPatch,
} from '@embedpdf/engine-core/runtime';
import type { PdfFunctions, PdfRuntimeMemory, Ptr } from '@embedpdf/pdf-runtime';

import type { AnnotationWriteContext } from './annotationWriteContext';
import { applyCaretDraft, applyCaretPatch, isCaretSubtype } from './writeCaretAnnotation';
import {
  applyFileAttachmentDraft,
  applyFileAttachmentPatch,
  isFileAttachmentSubtype,
  preflightFileAttachmentDraft,
} from './writeFileAttachmentAnnotation';
import {
  applyFreeTextDraft,
  applyFreeTextPatch,
  isFreeTextSubtype,
} from './writeFreeTextAnnotation';
import { applyInkDraft, applyInkPatch, isInkSubtype } from './writeInkAnnotation';
import { applyLineDraft, applyLinePatch, isLineSubtype } from './writeLineAnnotation';
import { applyLinkDraft, applyLinkPatch, isLinkSubtype } from './writeLinkAnnotation';
import {
  applyShapeDraft,
  applyShapePatch,
  isShapeSubtype,
  type ShapeDraft,
  type ShapePatch,
} from './writeShapeAnnotation';
import {
  applyStampDraft,
  applyStampPatch,
  isStampSubtype,
  preflightStampDraft,
  preflightStampPatch,
} from './writeStampAnnotation';
import { applyTextDraft, applyTextPatch, isTextSubtype } from './writeTextAnnotation';
import {
  applyTextMarkupDraft,
  applyTextMarkupPatch,
  isTextMarkupSubtype,
  type TextMarkupDraft,
  type TextMarkupPatch,
} from './writeTextMarkupAnnotation';
import {
  applyPolygonDraft,
  applyPolygonPatch,
  applyPolylineDraft,
  applyPolylinePatch,
  isVertexSubtype,
} from './writeVertexAnnotation';
import { applyWidgetDraft, applyWidgetPatch, isWidgetSubtype } from './writeWidgetAnnotation';

/** Validate subtype inputs before AnnotationMutator performs any native write. */
export function preflightDraft(draft: WireAnnotationDraft, ctx?: AnnotationWriteContext): void {
  if (isStampSubtype(draft.subtype)) {
    preflightStampDraft(draft as StampWireDraft, ctx);
  }
  if (isFileAttachmentSubtype(draft.subtype)) {
    preflightFileAttachmentDraft(draft as FileAttachmentWireDraft, ctx);
  }
}

/** Validate subtype inputs before AnnotationMutator performs any native write. */
export function preflightPatch(patch: WireAnnotationPatch, ctx?: AnnotationWriteContext): void {
  if (isStampSubtype(patch.subtype)) {
    preflightStampPatch(patch as StampWirePatch, ctx);
  }
}

/**
 * Per-subtype write dispatch, mirroring the read-side registry. Adding a
 * new subtype is one extra arm here plus its writer module — no other
 * file in this package needs to change.
 *
 * The mutator calls `applyDraft` or `applyPatch` once per mutation; the
 * actual `EPDFPage_CreateAnnot` / identity resolution happens around
 * these calls in `AnnotationMutator`.
 */
export function applyDraft(
  fn: PdfFunctions,
  mem: PdfRuntimeMemory,
  annotPtr: Ptr,
  draft: WireAnnotationDraft,
  ctx?: AnnotationWriteContext,
): void {
  if (isTextMarkupSubtype(draft.subtype)) {
    applyTextMarkupDraft(fn, mem, annotPtr, draft as TextMarkupDraft);
    return;
  }
  if (isShapeSubtype(draft.subtype)) {
    applyShapeDraft(fn, mem, annotPtr, draft as ShapeDraft);
    return;
  }
  if (isVertexSubtype(draft.subtype)) {
    if (draft.subtype === 'polygon') {
      applyPolygonDraft(fn, mem, annotPtr, draft as PolygonDraft);
    } else {
      applyPolylineDraft(fn, mem, annotPtr, draft as PolylineDraft);
    }
    return;
  }
  if (isLineSubtype(draft.subtype)) {
    applyLineDraft(fn, mem, annotPtr, draft as LineDraft);
    return;
  }
  if (isLinkSubtype(draft.subtype)) {
    applyLinkDraft(fn, mem, annotPtr, draft as LinkDraft, ctx);
    return;
  }
  if (isInkSubtype(draft.subtype)) {
    applyInkDraft(fn, mem, annotPtr, draft as InkDraft);
    return;
  }
  if (isFreeTextSubtype(draft.subtype)) {
    applyFreeTextDraft(fn, mem, annotPtr, draft as FreeTextDraft, ctx);
    return;
  }
  if (isCaretSubtype(draft.subtype)) {
    applyCaretDraft(fn, mem, annotPtr, draft as CaretDraft);
    return;
  }
  if (isTextSubtype(draft.subtype)) {
    applyTextDraft(fn, mem, annotPtr, draft as TextDraft);
    return;
  }
  if (isStampSubtype(draft.subtype)) {
    applyStampDraft(fn, mem, annotPtr, draft as StampWireDraft, ctx);
    return;
  }
  if (isFileAttachmentSubtype(draft.subtype)) {
    applyFileAttachmentDraft(fn, mem, annotPtr, draft as FileAttachmentWireDraft, ctx);
    return;
  }
  if (isWidgetSubtype(draft.subtype)) {
    applyWidgetDraft(fn, mem, annotPtr, draft as WidgetDraft);
    return;
  }
  // Should be unreachable: AnnotationDraft is the closed union of writable
  // subtypes (which today is exactly the four text-markup kinds — the
  // unsupported kind has Draft = never). The check is here so a future
  // subtype that lands in `AnnotationDraft` without a writer entry fails
  // loud at runtime instead of silently no-op-ing.
  throw new EngineError(
    EngineErrorCode.NotImplemented,
    `no writer registered for draft.subtype='${(draft as { subtype: string }).subtype}'`,
  );
}

export function applyPatch(
  fn: PdfFunctions,
  mem: PdfRuntimeMemory,
  annotPtr: Ptr,
  patch: WireAnnotationPatch,
  ctx?: AnnotationWriteContext,
): void {
  if (isTextMarkupSubtype(patch.subtype)) {
    applyTextMarkupPatch(fn, mem, annotPtr, patch as TextMarkupPatch);
    return;
  }
  if (isShapeSubtype(patch.subtype)) {
    applyShapePatch(fn, mem, annotPtr, patch as ShapePatch);
    return;
  }
  if (isVertexSubtype(patch.subtype)) {
    if (patch.subtype === 'polygon') {
      applyPolygonPatch(fn, mem, annotPtr, patch as PolygonPatch);
    } else {
      applyPolylinePatch(fn, mem, annotPtr, patch as PolylinePatch);
    }
    return;
  }
  if (isLineSubtype(patch.subtype)) {
    applyLinePatch(fn, mem, annotPtr, patch as LinePatch);
    return;
  }
  if (isLinkSubtype(patch.subtype)) {
    applyLinkPatch(fn, mem, annotPtr, patch as LinkPatch, ctx);
    return;
  }
  if (isInkSubtype(patch.subtype)) {
    applyInkPatch(fn, mem, annotPtr, patch as InkPatch);
    return;
  }
  if (isFreeTextSubtype(patch.subtype)) {
    applyFreeTextPatch(fn, mem, annotPtr, patch as FreeTextPatch, ctx);
    return;
  }
  if (isCaretSubtype(patch.subtype)) {
    applyCaretPatch(fn, mem, annotPtr, patch as CaretPatch);
    return;
  }
  if (isTextSubtype(patch.subtype)) {
    applyTextPatch(fn, mem, annotPtr, patch as TextPatch);
    return;
  }
  if (isStampSubtype(patch.subtype)) {
    applyStampPatch(fn, mem, annotPtr, patch as StampWirePatch, ctx);
    return;
  }
  if (isFileAttachmentSubtype(patch.subtype)) {
    applyFileAttachmentPatch(fn, mem, annotPtr, patch as FileAttachmentPatch);
    return;
  }
  if (isWidgetSubtype(patch.subtype)) {
    applyWidgetPatch(fn, mem, annotPtr, patch as WidgetPatch);
    return;
  }
  throw new EngineError(
    EngineErrorCode.NotImplemented,
    `no writer registered for patch.subtype='${(patch as { subtype: string }).subtype}'`,
  );
}
