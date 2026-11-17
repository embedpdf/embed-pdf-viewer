import {
  DEFAULT_RICH_TEXT_BODY,
  EngineError,
  EngineErrorCode,
  type AnnotationDraft,
  type AnnotationPatch,
  type PlacedDraft,
  type RichTextDocumentInput,
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
  PdfCoordinates,
} from '@embedpdf/engine-core/runtime';
import type { PdfFunctions, PdfRuntimeMemory, Ptr } from '@embedpdf/engine-runtime';

import { engineRichTextJson } from '../richTextWire';
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
import {
  applyInkDraft,
  applyInkPatch,
  drawInkAppearance,
  isInkSubtype,
  preflightInkAppearance,
} from './writeInkAnnotation';
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
export function preflightDraft(
  draft: AnnotationDraft<PdfCoordinates>,
  ctx?: AnnotationWriteContext,
): void {
  if (isStampSubtype(draft.subtype)) {
    preflightStampDraft(draft as StampDraft<PdfCoordinates>, ctx);
  }
  if (isFileAttachmentSubtype(draft.subtype)) {
    preflightFileAttachmentDraft(draft as FileAttachmentDraft<PdfCoordinates>, ctx);
  }
  if (isRedactSubtype(draft.subtype)) {
    preflightRedactDraft(draft as RedactDraft<PdfCoordinates>);
  }
  if (isInkSubtype(draft.subtype)) preflightInkAppearance(ctx);
}

/** Validate subtype inputs before AnnotationMutator performs any native write. */
export function preflightPatch(
  patch: AnnotationPatch<PdfCoordinates>,
  ctx?: AnnotationWriteContext,
): void {
  if (isStampSubtype(subtypeOf(patch))) {
    preflightStampPatch(patch as StampPatch<PdfCoordinates>, ctx);
  }
  if (isInkSubtype(subtypeOf(patch))) preflightInkAppearance(ctx);
}

/**
 * After the generator: a kind whose `appearance` resource is drawn over
 * what the generator made (ink) draws it. `true` when one was drawn.
 */
export function drawAppearanceResource(
  fn: PdfFunctions,
  mem: PdfRuntimeMemory,
  annotPtr: Ptr,
  subtype: string,
  ctx?: AnnotationWriteContext,
): boolean {
  return isInkSubtype(subtype) && drawInkAppearance(fn, mem, annotPtr, ctx);
}

/**
 * Per-subtype write dispatch, mirroring the read-side registry, then a
 * markup annotation's comment (`applyComment`). Adding a new subtype is one
 * extra arm here plus its writer module — no other file in this package
 * needs to change.
 *
 * The mutator calls `applyDraft` or `applyPatch` once per mutation; the
 * actual `EPDFPage_CreateAnnot` / identity resolution happens around
 * these calls in `AnnotationMutator`. A draft here is resolved
 * (`pdfResolveAnnotationDraft`), so a box kind's states its box.
 */
export function applyDraft(
  fn: PdfFunctions,
  mem: PdfRuntimeMemory,
  annotPtr: Ptr,
  draft: AnnotationDraft<PdfCoordinates>,
  ctx?: AnnotationWriteContext,
): void {
  applyKindDraft(fn, mem, annotPtr, draft, ctx);
  applyComment(fn, annotPtr, draft, ctx);
}

export function applyPatch(
  fn: PdfFunctions,
  mem: PdfRuntimeMemory,
  annotPtr: Ptr,
  patch: AnnotationPatch<PdfCoordinates>,
  ctx?: AnnotationWriteContext,
): void {
  applyKindPatch(fn, mem, annotPtr, patch, ctx);
  applyComment(fn, annotPtr, { ...patch, subtype: subtypeOf(patch) }, ctx);
}

/**
 * A markup annotation's comment as rich text (`/RC`), after the kind's
 * fields, whose base wrote its `contents`: rich text writes `/RC` and its
 * plain projection in `/Contents`, `null` removes `/RC` and leaves
 * `/Contents`. A free text writes its own: its rich text is what it draws.
 */
function applyComment(
  fn: PdfFunctions,
  annotPtr: Ptr,
  input: { subtype?: string; richText?: RichTextDocumentInput | null },
  ctx?: AnnotationWriteContext,
): void {
  if (input.subtype === 'free-text' || input.richText === undefined) return;
  if (input.richText === null) {
    fn.EPDFAnnot_RemoveKey(annotPtr, 'RC');
    return;
  }
  const json = engineRichTextJson(commentWithoutDefaultFamily(input.richText), {
    describe: ctx?.describeFont,
  });
  if (!fn.EPDFAnnot_SetRichTextJSON(annotPtr, json)) {
    throw new EngineError(
      EngineErrorCode.InvalidArg,
      `${input.subtype}: the comment's rich text could not be written`,
    );
  }
}

/**
 * A comment's rich text with a body in the default family written as one
 * naming none: a comment that names none reads back in it
 * (`readCommentRichText`), so another tool's comment sent back keeps its
 * reader's face.
 */
function commentWithoutDefaultFamily(input: RichTextDocumentInput): RichTextDocumentInput {
  if (input.body?.family !== DEFAULT_RICH_TEXT_BODY.family) return input;
  const { family: _family, ...body } = input.body;
  void _family;
  return { ...input, body };
}

function applyKindDraft(
  fn: PdfFunctions,
  mem: PdfRuntimeMemory,
  annotPtr: Ptr,
  draft: AnnotationDraft<PdfCoordinates>,
  ctx?: AnnotationWriteContext,
): void {
  if (isTextMarkupSubtype(draft.subtype)) {
    applyTextMarkupDraft(fn, mem, annotPtr, draft as TextMarkupDraft);
    return;
  }
  if (isShapeSubtype(draft.subtype)) {
    applyShapeDraft(fn, mem, annotPtr, draft as PlacedDraft<ShapeDraft>);
    return;
  }
  if (isVertexSubtype(draft.subtype)) {
    if (draft.subtype === 'polygon') {
      applyPolygonDraft(fn, mem, annotPtr, draft as PolygonDraft<PdfCoordinates>);
    } else {
      applyPolylineDraft(fn, mem, annotPtr, draft as PolylineDraft<PdfCoordinates>);
    }
    return;
  }
  if (isLineSubtype(draft.subtype)) {
    applyLineDraft(fn, mem, annotPtr, draft as LineDraft<PdfCoordinates>);
    return;
  }
  if (isLinkSubtype(draft.subtype)) {
    applyLinkDraft(fn, mem, annotPtr, draft as LinkDraft<PdfCoordinates>, ctx);
    return;
  }
  if (isInkSubtype(draft.subtype)) {
    applyInkDraft(fn, mem, annotPtr, draft as InkDraft<PdfCoordinates>);
    return;
  }
  if (isFreeTextSubtype(draft.subtype)) {
    applyFreeTextDraft(fn, mem, annotPtr, draft as PlacedDraft<FreeTextDraft<PdfCoordinates>>, ctx);
    return;
  }
  if (isCaretSubtype(draft.subtype)) {
    applyCaretDraft(fn, mem, annotPtr, draft as PlacedDraft<CaretDraft<PdfCoordinates>>);
    return;
  }
  if (isTextSubtype(draft.subtype)) {
    applyTextDraft(fn, mem, annotPtr, draft as TextDraft<PdfCoordinates>);
    return;
  }
  if (isStampSubtype(draft.subtype)) {
    applyStampDraft(fn, mem, annotPtr, draft as PlacedDraft<StampDraft<PdfCoordinates>>, ctx);
    return;
  }
  if (isFileAttachmentSubtype(draft.subtype)) {
    applyFileAttachmentDraft(fn, mem, annotPtr, draft as FileAttachmentDraft<PdfCoordinates>, ctx);
    return;
  }
  if (isWidgetSubtype(draft.subtype)) {
    applyWidgetDraft(fn, mem, annotPtr, draft as PlacedDraft<WidgetDraft<PdfCoordinates>>, ctx);
    return;
  }
  if (isPopupSubtype(draft.subtype)) {
    applyPopupDraft(fn, mem, annotPtr, draft as PopupDraft<PdfCoordinates>);
    return;
  }
  if (isRedactSubtype(draft.subtype)) {
    applyRedactDraft(fn, mem, annotPtr, draft as RedactDraft<PdfCoordinates>, ctx);
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

function applyKindPatch(
  fn: PdfFunctions,
  mem: PdfRuntimeMemory,
  annotPtr: Ptr,
  patch: AnnotationPatch<PdfCoordinates>,
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
      applyPolygonPatch(fn, mem, annotPtr, patch as PolygonPatch<PdfCoordinates>);
    } else {
      applyPolylinePatch(fn, mem, annotPtr, patch as PolylinePatch<PdfCoordinates>);
    }
    return;
  }
  if (isLineSubtype(subtype)) {
    applyLinePatch(fn, mem, annotPtr, patch as LinePatch<PdfCoordinates>);
    return;
  }
  if (isLinkSubtype(subtype)) {
    applyLinkPatch(fn, mem, annotPtr, patch as LinkPatch<PdfCoordinates>, ctx);
    return;
  }
  if (isInkSubtype(subtype)) {
    applyInkPatch(fn, mem, annotPtr, patch as InkPatch<PdfCoordinates>);
    return;
  }
  if (isFreeTextSubtype(subtype)) {
    applyFreeTextPatch(fn, mem, annotPtr, patch as FreeTextPatch<PdfCoordinates>, ctx);
    return;
  }
  if (isCaretSubtype(subtype)) {
    applyCaretPatch(fn, mem, annotPtr, patch as CaretPatch<PdfCoordinates>);
    return;
  }
  if (isTextSubtype(subtype)) {
    applyTextPatch(fn, mem, annotPtr, patch as TextPatch<PdfCoordinates>);
    return;
  }
  if (isStampSubtype(subtype)) {
    applyStampPatch(fn, mem, annotPtr, patch as StampPatch<PdfCoordinates>, ctx);
    return;
  }
  if (isFileAttachmentSubtype(subtype)) {
    applyFileAttachmentPatch(fn, mem, annotPtr, patch as FileAttachmentPatch<PdfCoordinates>, ctx);
    return;
  }
  if (isWidgetSubtype(subtype)) {
    applyWidgetPatch(fn, mem, annotPtr, patch as WidgetPatch<PdfCoordinates>, ctx);
    return;
  }
  if (isPopupSubtype(subtype)) {
    applyPopupPatch(fn, mem, annotPtr, patch as PopupPatch<PdfCoordinates>);
    return;
  }
  if (isRedactSubtype(subtype)) {
    applyRedactPatch(fn, mem, annotPtr, patch as RedactPatch<PdfCoordinates>, ctx);
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
function subtypeOf(patch: AnnotationPatch<PdfCoordinates>): string {
  if (patch.subtype === undefined) {
    throw new EngineError(
      EngineErrorCode.InvalidArg,
      'a patch reached the writer without its subtype',
    );
  }
  return patch.subtype;
}
