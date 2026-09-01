import {
  EngineError,
  EngineErrorCode,
  type LinkDraft,
  type LinkPatch,
  type PdfDestination,
  type PdfLinkTargetWritable,
} from '@embedpdf/engine-core/runtime';
import type { PdfFunctions, PdfRuntimeMemory, Ptr } from '@embedpdf/engine-runtime';
import { NULL_PTR } from '@embedpdf/engine-runtime';

import { withScratch } from '../../../../runtime/memory/scratch';
import { F32_BYTES } from '../../../../runtime/memory/structs';
import { VIEW_CODE_BY_KIND } from '../../../destinations/destinationViewCodes';
import { setAnnotRect } from './annotationWritePrimitives';
import type { AnnotationWriteContext } from './annotationWriteContext';
import { applyAnnotationBaseDraft, applyAnnotationBasePatch } from './writeAnnotationBase';

/**
 * Link writer: rect + the `/A` action. Only `goto`/`uri` targets are
 * writable (the draft/patch types enforce it; `goto-remote`/`launch` are
 * read-only by design). Relationship (`/IRT` + `/RT` — v2's grouped links)
 * is written by the mutator's kind-agnostic relationship pass, never here.
 *
 * A retarget REPLACES `/A`; it cannot remove a pre-existing direct `/Dest`
 * (no dict-entry removal primitive in the runtime), which is why the link
 * READER gives `/A` precedence — see readLinkAnnotation.ts.
 */
export function applyLinkDraft(
  fn: PdfFunctions,
  mem: PdfRuntimeMemory,
  annotPtr: Ptr,
  draft: LinkDraft,
  ctx?: AnnotationWriteContext,
): void {
  applyAnnotationBaseDraft(fn, mem, annotPtr, draft);
  setAnnotRect(fn, mem, annotPtr, draft.rect);
  // `target: null` is the create-then-edit flow: the rect exists first, a
  // later patch supplies the destination/URI. Nothing to write yet.
  if (draft.target) applyLinkTarget(fn, mem, annotPtr, draft.target, ctx);
}

export function applyLinkPatch(
  fn: PdfFunctions,
  mem: PdfRuntimeMemory,
  annotPtr: Ptr,
  patch: LinkPatch,
  ctx?: AnnotationWriteContext,
): void {
  applyAnnotationBasePatch(fn, mem, annotPtr, patch);
  if (patch.rect !== undefined) setAnnotRect(fn, mem, annotPtr, patch.rect);
  if (patch.target === null) clearLinkTarget(fn, annotPtr);
  else if (patch.target !== undefined) applyLinkTarget(fn, mem, annotPtr, patch.target, ctx);
}

/**
 * `target: null` → a dead link. The model treats the target as ONE concept
 * with two spellings, so THIS layer composes the two single-purpose
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
  target: PdfLinkTargetWritable,
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
      : fn.EPDFAction_CreateGoTo(docPtr, createDestination(fn, mem, docPtr, target.destination));
  if (!actionPtr) {
    throw new EngineError(EngineErrorCode.Unknown, `failed to create '${target.kind}' action`);
  }
  if (!fn.EPDFAnnot_SetAction(annotPtr, actionPtr)) {
    throw new EngineError(EngineErrorCode.Unknown, 'EPDFAnnot_SetAction failed for link');
  }
}

/**
 * Build an INDIRECT explicit-destination array for `dest`. The target page
 * is loaded just to reference its dictionary and closed immediately —
 * destinations routinely point at pages the mutator's pool never touches.
 */
function createDestination(
  fn: PdfFunctions,
  mem: PdfRuntimeMemory,
  docPtr: Ptr,
  dest: PdfDestination,
): Ptr {
  const pagePtr = fn.EPDFDoc_LoadPageByObjectNumber(docPtr, dest.pageObjectNumber);
  if (!pagePtr) {
    throw new EngineError(
      EngineErrorCode.NotFound,
      `link destination page not found: pageObjectNumber=${dest.pageObjectNumber}`,
    );
  }
  try {
    const destPtr =
      dest.kind === 'xyz'
        ? // Absent axes write PDF nulls (spec: "retain current value").
          fn.EPDFDest_CreateXYZ(
            pagePtr,
            dest.left != null,
            dest.left ?? 0,
            dest.top != null,
            dest.top ?? 0,
            dest.zoom != null,
            dest.zoom ?? 0,
          )
        : createViewDestination(fn, mem, pagePtr, dest);
    if (!destPtr) {
      throw new EngineError(EngineErrorCode.Unknown, `failed to create '${dest.kind}' destination`);
    }
    return destPtr;
  } finally {
    fn.FPDF_ClosePage(pagePtr);
  }
}

function createViewDestination(
  fn: PdfFunctions,
  mem: PdfRuntimeMemory,
  pagePtr: Ptr,
  dest: Exclude<PdfDestination, { kind: 'xyz' }>,
): Ptr {
  // The runtime pads missing params with 0 up to the fit type's arity —
  // a null top/left therefore writes as 0 (v2 parity; the array form has
  // no per-param null encoding through this API).
  const params: number[] = (() => {
    switch (dest.kind) {
      case 'fitH':
      case 'fitBH':
        return dest.top != null ? [dest.top] : [];
      case 'fitV':
      case 'fitBV':
        return dest.left != null ? [dest.left] : [];
      case 'fitR':
        return [dest.left, dest.bottom, dest.right, dest.top];
      default:
        return [];
    }
  })();

  const view = VIEW_CODE_BY_KIND[dest.kind];
  if (!params.length) return fn.EPDFDest_CreateView(pagePtr, view, NULL_PTR, 0);
  return withScratch(mem, params.length * F32_BYTES, (buf) => {
    for (let i = 0; i < params.length; i++) mem.poke(buf, 'f32', params[i]!, i * F32_BYTES);
    return fn.EPDFDest_CreateView(pagePtr, view, buf, params.length);
  });
}
