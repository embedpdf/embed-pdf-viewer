import type {
  AnnotationBase,
  LinkAnnotationDTO,
  PdfLinkTarget,
} from '@embedpdf/engine-core/runtime';
import type { PdfFunctions, PdfRuntimeMemory, Ptr } from '@embedpdf/pdf-runtime';

import type { AnnotationReadContext } from './annotationReadContext';
import { readDestination } from './readDestination';
import { readUtf8String } from '../../../../runtime/memory/strings';

// PDFACTION_* (public/fpdf_doc.h) — FPDFAction_GetType's vocabulary. NOT the
// EPDF action-model codes (those live in features/actions).
const ACTION_GOTO = 1;
const ACTION_REMOTEGOTO = 2;
const ACTION_URI = 3;
const ACTION_LAUNCH = 4;

/**
 * Link reader: rect/flags/relationship ride the base (a link grouped to an
 * annotation is plain `inReplyTo` + `replyType: 'group'`); this module only
 * materialises the normalized target.
 *
 * `/A` is read BEFORE `/Dest` — the spec forbids carrying both, and when a
 * malformed file (or our own retarget patch, which cannot remove a stray
 * `/Dest`) has both, Acrobat gives the action precedence. v2 read dest-first
 * and would have resurrected the stale `/Dest` after every retarget.
 */
export function readLink(
  fn: PdfFunctions,
  mem: PdfRuntimeMemory,
  annotPtr: Ptr,
  base: AnnotationBase,
  _rawSubtypeCode: number,
  ctx: AnnotationReadContext,
): LinkAnnotationDTO {
  return { ...base, subtype: 'link', target: readLinkTarget(fn, mem, annotPtr, ctx) };
}

function readLinkTarget(
  fn: PdfFunctions,
  mem: PdfRuntimeMemory,
  annotPtr: Ptr,
  ctx: AnnotationReadContext,
): PdfLinkTarget | null {
  const linkPtr = fn.FPDFAnnot_GetLink(annotPtr);
  if (!linkPtr) return null;

  const actionPtr = fn.FPDFLink_GetAction(linkPtr);
  if (actionPtr) {
    const target = readActionTarget(fn, mem, actionPtr, ctx);
    if (target) return target;
  }

  // No (readable) action → the direct `/Dest`, normalized onto `goto`.
  const destPtr = fn.FPDFLink_GetDest(ctx.docPtr, linkPtr);
  if (destPtr) {
    const destination = readDestination(fn, mem, ctx.docPtr, destPtr);
    return destination ? { kind: 'goto', destination } : { kind: 'unsupported' };
  }

  // Neither `/A` nor `/Dest`: a dead link. Legal; reported as-is.
  return actionPtr ? { kind: 'unsupported' } : null;
}

function readActionTarget(
  fn: PdfFunctions,
  mem: PdfRuntimeMemory,
  actionPtr: Ptr,
  ctx: AnnotationReadContext,
): PdfLinkTarget | null {
  switch (fn.FPDFAction_GetType(actionPtr)) {
    case ACTION_GOTO: {
      const destPtr = fn.FPDFAction_GetDest(ctx.docPtr, actionPtr);
      if (!destPtr) return { kind: 'unsupported' };
      const destination = readDestination(fn, mem, ctx.docPtr, destPtr);
      return destination ? { kind: 'goto', destination } : { kind: 'unsupported' };
    }
    case ACTION_URI: {
      const uri = readUtf8String(mem, (buf, capacity) =>
        fn.FPDFAction_GetURIPath(ctx.docPtr, actionPtr, buf, capacity),
      );
      return uri == null ? { kind: 'unsupported' } : { kind: 'uri', uri };
    }
    // Reported, never followed/executed (and never writable — see the DTO).
    case ACTION_REMOTEGOTO: {
      const file = readUtf8String(mem, (buf, capacity) =>
        fn.FPDFAction_GetFilePath(actionPtr, buf, capacity),
      );
      return { kind: 'goto-remote', file: file ?? '' };
    }
    case ACTION_LAUNCH: {
      const path = readUtf8String(mem, (buf, capacity) =>
        fn.FPDFAction_GetFilePath(actionPtr, buf, capacity),
      );
      return { kind: 'launch', path: path ?? '' };
    }
    default:
      // Unknown action type: let the caller decide (it reports `unsupported`
      // unless a direct `/Dest` can still resolve the link).
      return null;
  }
}
