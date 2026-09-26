import {
  EngineError,
  EngineErrorCode,
  type AnnotationDraft,
  type AnnotationPatch,
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
  RedactDraft,
  RedactPatch,
  StampDraft,
  StampPatch,
  TextDraft,
  TextPatch,
  FileAttachmentDraft,
  FileAttachmentPatch,
  PopupDraft,
  PopupPatch,
} from '@embedpdf/engine-core/runtime';
import type { PdfFunctions, PdfRuntimeMemory, Ptr } from '@embedpdf/engine-runtime';

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
import { applyPopupDraft, applyPopupPatch, isPopupSubtype } from './writePopupAnnotation';
import {
  applyRedactDraft,
  applyRedactPatch,
  isRedactSubtype,
  preflightRedactDraft,
} from './writeRedactAnnotation';
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
import {
  applyTextDraft,
  applyTextPatch,
  isTextSubtype,
  preflightTextDraft,
} from './writeTextAnnotation';
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
export function preflightDraft(draft: AnnotationDraft, ctx?: AnnotationWriteContext): void {
  if (isStampSubtype(draft.subtype)) {
    preflightStampDraft(draft as StampDraft, ctx);
  }
  if (isFileAttachmentSubtype(draft.subtype)) {
    preflightFileAttachmentDraft(draft as FileAttachmentDraft, ctx);
  }
  if (isRedactSubtype(draft.subtype)) {
    preflightRedactDraft(draft as RedactDraft);
  }
  if (isTextSubtype(draft.subtype)) {
    preflightTextDraft(draft as TextDraft);
  }
}

/** Validate subtype inputs before AnnotationMutator performs any native write. */
export function preflightPatch(patch: AnnotationPatch, ctx?: AnnotationWriteContext): void {
  if (isStampSubtype(subtypeOf(patch))) {
    preflightStampPatch(patch as StampPatch, ctx);
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
  draft: AnnotationDraft,
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
    applyStampDraft(fn, mem, annotPtr, draft as StampDraft, ctx);
    return;
  }
  if (isFileAttachmentSubtype(draft.subtype)) {
    applyFileAttachmentDraft(fn, mem, annotPtr, draft as FileAttachmentDraft, ctx);
    return;
  }
  if (isWidgetSubtype(draft.subtype)) {
    applyWidgetDraft(fn, mem, annotPtr, draft as WidgetDraft);
    return;
  }
  if (isPopupSubtype(draft.subtype)) {
    applyPopupDraft(fn, mem, annotPtr, draft as PopupDraft);
    return;
  }
  if (isRedactSubtype(draft.subtype)) {
    applyRedactDraft(fn, mem, annotPtr, draft as RedactDraft, ctx);
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
  patch: AnnotationPatch,
  ctx?: AnnotationWriteContext,
): void {
  const subtype = subtypeOf(patch);
  if (isTextMarkupSubtype(subtype)) {
    applyTextMarkupPatch(fn, mem, annotPtr, patch as TextMarkupPatch);
    return;
  }
  if (isShapeSubtype(subtype)) {
    applyShapePatch(fn, mem, annotPtr, patch as ShapePatch);
    return;
  }
  if (isVertexSubtype(subtype)) {
    if (subtype === 'polygon') {
      applyPolygonPatch(fn, mem, annotPtr, patch as PolygonPatch);
    } else {
      applyPolylinePatch(fn, mem, annotPtr, patch as PolylinePatch);
    }
    return;
  }
  if (isLineSubtype(subtype)) {
    applyLinePatch(fn, mem, annotPtr, patch as LinePatch);
    return;
  }
  if (isLinkSubtype(subtype)) {
    applyLinkPatch(fn, mem, annotPtr, patch as LinkPatch, ctx);
    return;
  }
  if (isInkSubtype(subtype)) {
    applyInkPatch(fn, mem, annotPtr, patch as InkPatch);
    return;
  }
  if (isFreeTextSubtype(subtype)) {
    applyFreeTextPatch(fn, mem, annotPtr, patch as FreeTextPatch, ctx);
    return;
  }
  if (isCaretSubtype(subtype)) {
    applyCaretPatch(fn, mem, annotPtr, patch as CaretPatch);
    return;
  }
  if (isTextSubtype(subtype)) {
    applyTextPatch(fn, mem, annotPtr, patch as TextPatch);
    return;
  }
  if (isStampSubtype(subtype)) {
    applyStampPatch(fn, mem, annotPtr, patch as StampPatch, ctx);
    return;
  }
  if (isFileAttachmentSubtype(subtype)) {
    applyFileAttachmentPatch(fn, mem, annotPtr, patch as FileAttachmentPatch, ctx);
    return;
  }
  if (isWidgetSubtype(subtype)) {
    applyWidgetPatch(fn, mem, annotPtr, patch as WidgetPatch);
    return;
  }
  if (isPopupSubtype(subtype)) {
    applyPopupPatch(fn, mem, annotPtr, patch as PopupPatch);
    return;
  }
  if (isRedactSubtype(subtype)) {
    applyRedactPatch(fn, mem, annotPtr, patch as RedactPatch, ctx);
    return;
  }
  throw new EngineError(
    EngineErrorCode.NotImplemented,
    `no writer registered for subtype='${subtype}'`,
  );
}

/**
 * The subtype a patch is written as. The mutator fills it in from the target
 * before any write, since a caller may leave it out.
 */
function subtypeOf(patch: AnnotationPatch): string {
  if (patch.subtype === undefined) {
    throw new EngineError(
      EngineErrorCode.InvalidArg,
      'a patch reached the writer without its subtype',
    );
  }
  return patch.subtype;
}
