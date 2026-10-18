import {
  EngineError,
  EngineErrorCode,
  type PdfActionTree,
  type PdfDestination,
  type PdfLinkTarget,
  type PdfLinkTargetWritable,
} from '@embedpdf/engine-core/runtime';
import type { PdfFunctions, PdfRuntimeMemory, Ptr } from '@embedpdf/engine-runtime';

import { createDestination } from './createDestination';

/**
 * A link target read the way every reader reads one (links, outline items):
 * the navigation view of a payload-carrying activate tree. Pure.
 *
 * The law, enforced at the projection too: never execute — not even
 * navigate the root of — a tree marked incomplete. A broken action is a
 * dead target, never an invitation to guess.
 */
export function linkTargetFromActionTree(
  tree: PdfActionTree<PdfDestination>,
): PdfLinkTarget<PdfDestination> | null {
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

/**
 * A new indirect action of the document for a writable target: a GoTo to a
 * new destination, a URI, or a standard named verb. Links and outline items
 * write their targets with it, so both read back the same way.
 */
export function createLinkTargetAction(
  fn: PdfFunctions,
  mem: PdfRuntimeMemory,
  docPtr: Ptr,
  target: PdfLinkTargetWritable<PdfDestination>,
): Ptr {
  const actionPtr =
    target.kind === 'uri'
      ? fn.EPDFAction_CreateURI(docPtr, target.uri)
      : target.kind === 'named'
        ? fn.EPDFAction_CreateNamed(docPtr, target.name)
        : fn.EPDFAction_CreateGoTo(docPtr, createDestination(fn, mem, docPtr, target.destination));
  if (!actionPtr) {
    throw new EngineError(EngineErrorCode.Unknown, `failed to create '${target.kind}' action`);
  }
  return actionPtr;
}
