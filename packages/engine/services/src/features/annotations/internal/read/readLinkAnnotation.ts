import type {
  AnnotationBase,
  LinkAnnotationDTO,
  PdfActionTree,
  PdfLinkTarget,
} from '@embedpdf/engine-core/runtime';
import type { PdfFunctions, PdfRuntimeMemory, Ptr } from '@embedpdf/engine-runtime';

import { readDestination } from '../../../destinations/readDestination';
import type { AnnotationReadContext } from './annotationReadContext';

/**
 * Link reader: rect/flags/relationship ride the base (a link grouped to an
 * annotation is plain `inReplyTo` + `replyType: 'group'`); this module only
 * materialises the normalized target.
 *
 * ONE truth, one projection: the target is a pure function of the SAME
 * payload-carrying action tree the scripting plane reads
 * (`base.actions.activate`) — no second native read exists any more, so the
 * two action-shaped surfaces cannot drift by construction.
 *
 * `/A` precedence, pinned: an activate action that exists but cannot be
 * executed (an `incomplete` tree, a degraded/unreadable root) projects
 * `unsupported` — a broken action is a dead link, never an invitation to
 * guess. The direct `/Dest` (which is data, not an action) is consulted
 * ONLY when no `/A` exists at all.
 */
export function readLink(
  fn: PdfFunctions,
  mem: PdfRuntimeMemory,
  annotPtr: Ptr,
  base: AnnotationBase,
  _rawSubtypeCode: number,
  ctx: AnnotationReadContext,
): LinkAnnotationDTO {
  return { ...base, subtype: 'link', target: readLinkTarget(fn, mem, annotPtr, base, ctx) };
}

/**
 * Project the navigation view from a payload-carrying activate tree. Pure —
 * shared with any consumer that wants the root-level navigation reading of a
 * tree (the link plugin's no-actions-plugin fallback uses the same law).
 */
export function linkTargetFromActionTree(tree: PdfActionTree): PdfLinkTarget | null {
  // The law, enforced at the projection too: never execute — not even
  // navigate the root of — a tree marked incomplete.
  if (tree.incomplete) return { kind: 'unsupported' };
  const root = tree.root;
  if (!root) return { kind: 'unsupported' };
  switch (root.type) {
    case 'goto':
      return { kind: 'goto', destination: root.destination };
    case 'uri':
      return { kind: 'uri', uri: root.uri };
    // Reported, never followed/executed (and never writable — see the DTO).
    case 'goto-remote':
      return { kind: 'goto-remote', file: root.filePath };
    case 'launch':
      return { kind: 'launch', path: root.filePath };
    case 'javascript':
      // No script payload here by design: the text rides the action tree —
      // the scripting plane's single home.
      return { kind: 'javascript' };
    case 'named':
      return { kind: 'named', name: root.name };
    default:
      return { kind: 'unsupported' };
  }
}

function readLinkTarget(
  fn: PdfFunctions,
  mem: PdfRuntimeMemory,
  annotPtr: Ptr,
  base: AnnotationBase,
  ctx: AnnotationReadContext,
): PdfLinkTarget | null {
  const activate = base.actions?.activate;
  if (activate) return linkTargetFromActionTree(activate);

  // No /A at all → the direct `/Dest`, normalized onto `goto`.
  const linkPtr = fn.FPDFAnnot_GetLink(annotPtr);
  if (!linkPtr) return null;
  const destPtr = fn.FPDFLink_GetDest(ctx.docPtr, linkPtr);
  if (!destPtr) return null; // neither /A nor /Dest: a dead link, reported as-is
  const destination = readDestination(fn, mem, ctx.docPtr, destPtr);
  return destination ? { kind: 'goto', destination } : { kind: 'unsupported' };
}
