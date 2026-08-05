import type {
  AnnotationBase,
  LinkAnnotationDTO,
  PdfLinkTarget,
} from '@embedpdf/engine-core/runtime';
import {
  NULL_PTR,
  type PdfFunctions,
  type PdfRuntimeMemory,
  type Ptr,
} from '@embedpdf/engine-runtime';

import { readUtf8String } from '../../../../runtime/memory/strings';
import {
  ANNOT_ACTION_ACTIVATE,
  actionTypeFromCode,
  isValidActionNodeId,
} from '../../../actions/ActionModelReader';
import type { AnnotationReadContext } from './annotationReadContext';
import { readDestination } from './readDestination';

/**
 * Link reader: rect/flags/relationship ride the base (a link grouped to an
 * annotation is plain `inReplyTo` + `replyType: 'group'`); this module only
 * materialises the normalized target.
 *
 * ONE truth, two views: the target is projected off the SAME fork action
 * model the scripting plane reads (`base.actions`) — root classification
 * via the full `EPDF_ACTION_TYPE_*` vocabulary, payloads via the on-demand
 * node getters. The classic `FPDFAction_*` surface (5 types, JavaScript-
 * and Named-blind) is deliberately not consulted; `FPDFLink_GetDest`
 * remains only for the data-only direct `/Dest`, which is not an action.
 *
 * `/A` wins over `/Dest` — the spec forbids carrying both, and when a
 * malformed file has both, Acrobat gives the action precedence. (Our own
 * writes can't produce that state: `EPDFAnnot_SetAction` strips `/Dest`.)
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
  // The activate slot (/A). Root-only read: O(1) native calls, no tree
  // walk — the chain (/Next) rides base.actions for the orchestrator.
  const modelPtr = fn.EPDFAnnot_GetActionModel(annotPtr, ANNOT_ACTION_ACTIVATE);
  if (modelPtr !== NULL_PTR) {
    try {
      const root = fn.EPDFAction_GetRootNode(modelPtr);
      if (isValidActionNodeId(root)) {
        return readRootTarget(fn, mem, modelPtr, root, ctx);
      }
    } finally {
      fn.EPDFAction_CloseModel(modelPtr);
    }
  }

  // No usable /A → the direct `/Dest`, normalized onto `goto`.
  const linkPtr = fn.FPDFAnnot_GetLink(annotPtr);
  if (!linkPtr) return null;
  const destPtr = fn.FPDFLink_GetDest(ctx.docPtr, linkPtr);
  if (!destPtr) return null; // neither /A nor /Dest: a dead link, reported as-is
  const destination = readDestination(fn, mem, ctx.docPtr, destPtr);
  return destination ? { kind: 'goto', destination } : { kind: 'unsupported' };
}

/** Classify the root action node and fetch its payload — the projection. */
function readRootTarget(
  fn: PdfFunctions,
  mem: PdfRuntimeMemory,
  modelPtr: Ptr,
  node: number,
  ctx: AnnotationReadContext,
): PdfLinkTarget {
  switch (actionTypeFromCode(fn.EPDFAction_GetNodeType(modelPtr, node))) {
    case 'goto': {
      const destPtr = fn.EPDFAction_GetNodeDest(ctx.docPtr, modelPtr, node);
      const destination = destPtr ? readDestination(fn, mem, ctx.docPtr, destPtr) : null;
      return destination ? { kind: 'goto', destination } : { kind: 'unsupported' };
    }
    case 'uri': {
      const uri = readUtf8String(mem, (buf, capacity) =>
        fn.EPDFAction_GetNodeURI(ctx.docPtr, modelPtr, node, buf, capacity),
      );
      return uri == null ? { kind: 'unsupported' } : { kind: 'uri', uri };
    }
    // Reported, never followed/executed (and never writable — see the DTO).
    case 'goto-remote': {
      const file = readUtf8String(mem, (buf, capacity) =>
        fn.EPDFAction_GetNodeFilePath(modelPtr, node, buf, capacity),
      );
      return { kind: 'goto-remote', file: file ?? '' };
    }
    case 'launch': {
      const path = readUtf8String(mem, (buf, capacity) =>
        fn.EPDFAction_GetNodeFilePath(modelPtr, node, buf, capacity),
      );
      return { kind: 'launch', path: path ?? '' };
    }
    case 'javascript':
      // No script payload here by design: the text rides base.actions —
      // the scripting plane's single home.
      return { kind: 'javascript' };
    case 'named': {
      const name = readUtf8String(mem, (buf, capacity) =>
        fn.EPDFAction_GetNodeName(modelPtr, node, buf, capacity),
      );
      return name == null ? { kind: 'unsupported' } : { kind: 'named', name };
    }
    default:
      return { kind: 'unsupported' };
  }
}
