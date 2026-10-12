import {
  EngineError,
  EngineErrorCode,
  type LinkDraft,
  type LinkPatch,
  type PdfDestination,
  type PdfLinkTargetWritable,
  type PdfCoordinates,
} from '@embedpdf/engine-core/runtime';
import type { PdfFunctions, PdfRuntimeMemory, Ptr } from '@embedpdf/engine-runtime';

import type { AnnotationWriteContext } from './annotationWriteContext';
import { setAnnotRect } from './annotationWritePrimitives';
import { applyAnnotationBaseDraft, applyAnnotationBasePatch } from './writeAnnotationBase';
import { createDestination } from '../../../destinations/createDestination';

/**
 * Link writer: rect + the `/A` action. `goto`, `uri` and the standard
 * `named` page verbs are writable (the draft/patch types enforce it;
 * `goto-remote`/`launch` are read-only by design). A new link draws no
 * border: `/Border [0 0 0]`, where PDF apps would draw a black one. Relationship (`/IRT` + `/RT`, for grouped links)
 * is written by the mutator's kind-agnostic relationship pass, never here.
 *
 * A retarget replaces `/A`; it cannot remove a pre-existing direct `/Dest`
 * (no dict-entry removal primitive in the runtime), which is why the link
 * reader gives `/A` precedence — see readLinkAnnotation.ts.
 */
export function applyLinkDraft(
  fn: PdfFunctions,
  mem: PdfRuntimeMemory,
  annotPtr: Ptr,
  draft: LinkDraft<PdfCoordinates>,
  ctx?: AnnotationWriteContext,
): void {
  applyAnnotationBaseDraft(fn, mem, annotPtr, draft);
  setAnnotRect(fn, mem, annotPtr, draft.rect);
  if (!fn.FPDFAnnot_SetBorder(annotPtr, 0, 0, 0)) {
    throw new EngineError(EngineErrorCode.Unknown, 'FPDFAnnot_SetBorder returned false');
  }
  // `target: null` is the create-then-edit flow: the rect exists first, a
  // later patch supplies the destination/URI. Nothing to write yet.
  if (draft.target) applyLinkTarget(fn, mem, annotPtr, draft.target, ctx);
}

export function applyLinkPatch(
  fn: PdfFunctions,
  mem: PdfRuntimeMemory,
  annotPtr: Ptr,
  patch: LinkPatch<PdfCoordinates>,
  ctx?: AnnotationWriteContext,
): void {
  applyAnnotationBasePatch(fn, mem, annotPtr, patch);
  if (patch.rect !== undefined) setAnnotRect(fn, mem, annotPtr, patch.rect);
  if (patch.target === null) clearLinkTarget(fn, annotPtr);
  else if (patch.target !== undefined) {
    // A read-only target sent back unchanged was dropped before the write
    // (`pdfResolveAnnotationPatch`); any other one, another app's named verb
    // included, was refused there.
    if (
      patch.target.kind !== 'goto' &&
      patch.target.kind !== 'uri' &&
      patch.target.kind !== 'named'
    ) {
      throw new EngineError(
        EngineErrorCode.InvalidArg,
        `a '${patch.target.kind}' link target can't be written`,
        { details: { field: 'target' } },
      );
    }
    applyLinkTarget(fn, mem, annotPtr, patch.target as PdfLinkTargetWritable<PdfDestination>, ctx);
  }
}

/**
 * `target: null` → a dead link. The model treats the target as one concept
 * with two spellings, so this layer composes the two single-purpose
 * removal primitives — removing only `/A` would resurrect a stale direct
 * `/Dest` as the live target.
 */
function clearLinkTarget(fn: PdfFunctions, annotPtr: Ptr): void {
  if (!fn.EPDFAnnot_RemoveAction(annotPtr) || !fn.EPDFAnnot_RemoveDest(annotPtr)) {
    throw new EngineError(EngineErrorCode.Unknown, 'failed to clear link target');
  }
}

export function isLinkSubtype(subtype: string): subtype is 'link' {
  return subtype === 'link';
}

function applyLinkTarget(
  fn: PdfFunctions,
  mem: PdfRuntimeMemory,
  annotPtr: Ptr,
  target: PdfLinkTargetWritable<PdfDestination>,
  ctx?: AnnotationWriteContext,
): void {
  const docPtr = ctx?.docPtr;
  if (!docPtr) {
    throw new EngineError(
      EngineErrorCode.InvalidArg,
      'writing a link target requires a document pointer on the write context',
    );
  }

  const actionPtr =
    target.kind === 'uri'
      ? fn.EPDFAction_CreateURI(docPtr, target.uri)
      : target.kind === 'named'
        ? fn.EPDFAction_CreateNamed(docPtr, target.name)
        : fn.EPDFAction_CreateGoTo(docPtr, createDestination(fn, mem, docPtr, target.destination));
  if (!actionPtr) {
    throw new EngineError(EngineErrorCode.Unknown, `failed to create '${target.kind}' action`);
  }
  if (!fn.EPDFAnnot_SetAction(annotPtr, actionPtr)) {
    throw new EngineError(EngineErrorCode.Unknown, 'EPDFAnnot_SetAction failed for link');
  }
}
