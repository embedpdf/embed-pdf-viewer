import type { DocumentEvent, EffectContext } from '@embedpdf/core';
import { AnnotationToken as AnnotationHostToken } from '@embedpdf/plugin-annotation/contract/host';
import { loadLinksPage } from './source';
import type { LinkAction, LinkState } from './types';

/**
 * Keeps the ENGINE-BACKED page cache honest in viewer-only deployments:
 * any annotation mutation on a cached page (own or remote — the cache has
 * no other refresh path, unlike the annotation plugin's optimistic model)
 * refetches that page's links. With the annotation plugin present the
 * folded model is the source and this effect never fires a fetch.
 */
export function registerLinkEffects(ctx: EffectContext<LinkState, LinkAction>): void {
  const doc = ctx.doc;
  if (!doc) return;

  const refetch = (pon: number): void => {
    if (ctx.tryGet(AnnotationHostToken)) return; // annotation model owns the data
    if (pon in ctx.getState().pages) loadLinksPage(ctx, pon);
  };

  const unsubscribe = doc.events.subscribe((event: DocumentEvent) => {
    switch (event.type) {
      case 'annotation.created':
        refetch(event.created.pageObjectNumber);
        break;
      case 'annotation.updated':
        refetch(event.updated.pageObjectNumber);
        break;
      case 'annotation.moved':
        if (event.moved.length) refetch(event.moved[0].pageObjectNumber);
        break;
      case 'annotation.deleted':
        refetch(event.pageObjectNumber);
        break;
      default:
        break;
    }
  });
  ctx.cleanup(unsubscribe);
}
