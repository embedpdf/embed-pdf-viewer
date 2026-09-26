import type {
  AnnotationRef,
  AnnotationReplyType,
  AnnotationStableId,
  PageObjectNumber,
} from '@embedpdf/engine-core/runtime';
import { EngineError, EngineErrorCode } from '@embedpdf/engine-core/runtime';
import { NULL_PTR, type PdfRuntimeModule, type Ptr } from '@embedpdf/engine-runtime';

import type { DocumentSession } from '../../../../document-session/DocumentSession';
import { captureOrStampStableId } from '../identity/captureOrStampStableId';
import { resolveAnnotPtr } from '../identity/resolveAnnotationPointer';
import { RT_UNKNOWN, replyTypeToCode } from '../replyType';

/**
 * The `/IRT` + `/RT` slice of a draft or patch, normalized to the three
 * cases the writer handles.
 */
export interface RelationshipWrite {
  /**
   * undefined -> leave `/IRT` untouched
   * null      -> clear `/IRT` (+ `/RT`)
   * ref       -> set/relink `/IRT` to this parent
   */
  inReplyTo?: AnnotationRef | null;
  /** `/RT` to write; defaults to `'reply'` when a link is set without it. */
  replyType?: AnnotationReplyType;
}

/**
 * Apply the `/IRT` + `/RT` relationship to `annotPtr` on an
 * already-acquired `pagePtr`. Returns the parent's (possibly newly
 * strengthened) {@link AnnotationStableId} when a link was set, so the
 * mutator can report the side-effecting promotion in `meta.changed`;
 * `null` for the clear / RT-only / no-op cases.
 *
 * Linking to a parent that is a weak/direct object promotes it to an
 * indirect object (`/IRT` must be an indirect reference). This is
 * non-structural — it assigns the parent an object number in place
 * without shifting any `/Annots` index — so it does not invalidate weak
 * refs or warrant a revision bump. We strengthen the parent with a
 * durable `/NM` before linking (via {@link captureOrStampStableId}) so its
 * identity survives a full save/reload, and report that id upstream.
 *
 * ISO 32000 §12.5.6.2 requires the reply and its parent to share a page;
 * we enforce that here with a fast `InvalidArg` (PDFium itself only checks
 * same-document).
 */
export function writeAnnotationRelationship(
  runtime: PdfRuntimeModule,
  session: DocumentSession,
  pagePtr: Ptr,
  annotPtr: Ptr,
  pageObjectNumber: PageObjectNumber,
  rel: RelationshipWrite,
): AnnotationStableId | null {
  const { fn } = runtime;

  // Clear: remove /IRT and /RT; the annotation becomes top-level.
  if (rel.inReplyTo === null) {
    fn.EPDFAnnot_SetLinkedAnnot(annotPtr, 'IRT', NULL_PTR);
    fn.EPDFAnnot_SetReplyType(annotPtr, RT_UNKNOWN);
    return null;
  }

  // Set / relink.
  if (rel.inReplyTo) {
    if (rel.inReplyTo.page.pageObjectNumber !== pageObjectNumber) {
      throw new EngineError(
        EngineErrorCode.InvalidArg,
        `/IRT parent must be on the same page as the reply (parent page ${rel.inReplyTo.page.pageObjectNumber}, reply page ${pageObjectNumber})`,
      );
    }
    const parentPtr = resolveAnnotPtr(runtime, session, pagePtr, rel.inReplyTo);
    try {
      // Strengthen before the link promotes the parent to indirect, so the
      // reported id is the save-stable /NM rather than a renumberable objNum.
      const parentStableId = captureOrStampStableId(runtime, parentPtr);
      linkReply(runtime, annotPtr, parentPtr, rel.replyType ?? 'reply');
      return parentStableId;
    } finally {
      fn.FPDFPage_CloseAnnot(parentPtr);
    }
  }

  // inReplyTo undefined: a standalone /RT change only applies if the
  // annotation already has an /IRT link (RT without IRT is meaningless per
  // ISO 32000 §12.5.6.2). Silently skip otherwise.
  if (rel.replyType !== undefined) {
    const linkedPtr = fn.FPDFAnnot_GetLinkedAnnot(annotPtr, 'IRT');
    if (linkedPtr) {
      try {
        fn.EPDFAnnot_SetReplyType(annotPtr, replyTypeToCode(rel.replyType));
      } finally {
        fn.FPDFPage_CloseAnnot(linkedPtr);
      }
    }
  }
  return null;
}

/**
 * Link a popup to the annotation it shows, in both directions: the popup's
 * `/Parent` and the parent's `/Popup` (ISO 32000-2 §12.5.6.14). `null`
 * unlinks it. A previous parent loses its `/Popup` when it pointed at this
 * popup. Returns the parent's stable id, which linking may strengthen.
 */
export function writePopupParent(
  runtime: PdfRuntimeModule,
  session: DocumentSession,
  pagePtr: Ptr,
  popupPtr: Ptr,
  pageObjectNumber: PageObjectNumber,
  parent: AnnotationRef | null,
  previousParent: AnnotationRef | null,
): AnnotationStableId | null {
  const { fn } = runtime;
  if (previousParent) {
    const previousPtr = resolveAnnotPtr(runtime, session, pagePtr, previousParent);
    try {
      const linkedPtr = fn.FPDFAnnot_GetLinkedAnnot(previousPtr, 'Popup');
      if (linkedPtr) {
        const pointsHere =
          fn.EPDFAnnot_GetObjectNumber(linkedPtr) === fn.EPDFAnnot_GetObjectNumber(popupPtr);
        fn.FPDFPage_CloseAnnot(linkedPtr);
        if (pointsHere) fn.EPDFAnnot_SetLinkedAnnot(previousPtr, 'Popup', NULL_PTR);
      }
    } finally {
      fn.FPDFPage_CloseAnnot(previousPtr);
    }
  }

  if (parent === null) {
    fn.EPDFAnnot_SetLinkedAnnot(popupPtr, 'Parent', NULL_PTR);
    return null;
  }
  if (parent.page.pageObjectNumber !== pageObjectNumber) {
    throw new EngineError(
      EngineErrorCode.InvalidArg,
      `a popup's parent must be on the same page (parent page ${parent.page.pageObjectNumber}, popup page ${pageObjectNumber})`,
    );
  }
  const parentPtr = resolveAnnotPtr(runtime, session, pagePtr, parent);
  try {
    const parentStableId = captureOrStampStableId(runtime, parentPtr);
    linkPopup(runtime, popupPtr, parentPtr);
    return parentStableId;
  } finally {
    fn.FPDFPage_CloseAnnot(parentPtr);
  }
}

/** Make `annotPtr` a reply of `type` to `parentPtr`: `/IRT` and `/RT`. */
export function linkReply(
  runtime: PdfRuntimeModule,
  annotPtr: Ptr,
  parentPtr: Ptr,
  type: AnnotationReplyType,
): void {
  const { fn } = runtime;
  if (!fn.EPDFAnnot_SetLinkedAnnot(annotPtr, 'IRT', parentPtr)) {
    throw new EngineError(EngineErrorCode.Unknown, 'failed to set /IRT linked annotation');
  }
  fn.EPDFAnnot_SetReplyType(annotPtr, replyTypeToCode(type));
}

/** Link a popup and the annotation it shows, both ways: `/Parent` and `/Popup`. */
export function linkPopup(runtime: PdfRuntimeModule, popupPtr: Ptr, parentPtr: Ptr): void {
  const { fn } = runtime;
  if (
    !fn.EPDFAnnot_SetLinkedAnnot(popupPtr, 'Parent', parentPtr) ||
    !fn.EPDFAnnot_SetLinkedAnnot(parentPtr, 'Popup', popupPtr)
  ) {
    throw new EngineError(EngineErrorCode.Unknown, 'failed to link a popup to its parent');
  }
}
