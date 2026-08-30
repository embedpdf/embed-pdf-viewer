/**
 * The attached-link lens — the conversation-plane pattern applied to link
 * children. The substrate keeps every `/RT /Group` link child as a
 * first-class `Annot`; these pure derivations present them as the parent's
 * `link` property. ONE source of truth (the children), so a remote
 * create/retarget/delete is an ordinary substrate upsert/remove and every
 * read converges through here — no folded copy on the parent, no join-key
 * ledger, no reconciliation rules between the two.
 *
 * Callers memoize by model identity where it matters (nav items, selection
 * props); these scans stay O(order) and allocation-light.
 */
import type { PdfLinkTarget } from '@embedpdf/engine-core/runtime';

import { isAttachedLink } from './plane';
import type { Annot, Id, Model } from './types';

/** Every attached link child of `parentId`, in z-order (multi-segment
 *  markup parents carry several children with one shared target). */
export function linkChildrenOf(m: Model, parentId: Id): Annot[] {
  const out: Annot[] = [];
  for (const id of m.order) {
    const a = m.byId[id];
    if (a && isAttachedLink(a) && a.group === parentId) out.push(a);
  }
  return out;
}

/** The parent's link target, derived from its first attached child — the
 *  read side of the `syncLink` reconciler. Null when no child exists. */
export function linkOf(m: Model, parentId: Id): PdfLinkTarget | null {
  const d = linkChildrenOf(m, parentId)[0]?.data;
  return d?.subtype === 'link' ? (d.target ?? null) : null;
}
