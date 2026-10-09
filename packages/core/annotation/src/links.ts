/**
 * The attached-link lens — the conversation-plane pattern applied to link
 * children. The substrate keeps every `/RT /Group` link child as a
 * first-class `ModelAnnotation`; these pure derivations present them as the parent's
 * `link` property. One source of truth (the children), so a remote
 * create/retarget/delete is an ordinary substrate upsert/remove and every
 * read converges through here — no folded copy on the parent, no join-key
 * ledger, no reconciliation rules between the two.
 *
 * Callers memoize by model identity where it matters (nav items, selection
 * props); these scans stay O(order) and allocation-light.
 */
import type { PdfLinkTarget } from '@embedpdf/engine-core/runtime';

import { isAttachedLink } from './plane';
import { groupOf } from './record';
import type { ModelAnnotation, Id, Model } from './types';

/** Every attached link child of `parentId`, in z-order (multi-segment
 *  markup parents carry several children with one shared target). */
export function linkChildrenOf(model: Model, parentId: Id): ModelAnnotation[] {
  const out: ModelAnnotation[] = [];
  for (const id of model.order) {
    const record = model.byId[id];
    if (record && isAttachedLink(record) && groupOf(record.annotation) === parentId)
      out.push(record);
  }
  return out;
}

/** The parent's link target, derived from its first attached child — the
 *  read side of the `syncLink` reconciler. Null when no child exists. */
export function linkOf(model: Model, parentId: Id): PdfLinkTarget | null {
  const child = linkChildrenOf(model, parentId)[0]?.annotation;
  return child?.subtype === 'link' ? (child.target ?? null) : null;
}
