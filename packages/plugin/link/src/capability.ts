import type { PluginContext } from '@embedpdf/core';
import type { PdfLinkTarget } from '@embedpdf/engine-core/runtime';
import { InteractionToken } from '@embedpdf/plugin-interaction';
import { destinationToReveal, StageToken } from '@embedpdf/plugin-stage';
// The host lens (linkItemsOn) — same runtime token as the public one.
import { AnnotationToken as AnnotationHostToken } from '@embedpdf/plugin-annotation/internal';
import { loadLinksPage } from './source';
import type {
  LinkAction,
  LinkActivation,
  LinkCapability,
  LinkNavItem,
  LinkPluginConfig,
  LinkState,
} from './types';

const EMPTY: LinkNavItem[] = [];

/**
 * The navigation plane's surface. Data source is decided PER CALL (lazily,
 * so plugin registration order can't matter): the annotation plugin's
 * folded model when present — its `linkItemsOn` lens is memoized by model
 * identity and already excludes hidden links — else this plugin's own
 * engine-backed page cache (see source.ts).
 */
export function createLinkCapability(
  ctx: PluginContext<LinkState, LinkAction>,
  config: LinkPluginConfig = {},
): LinkCapability {
  const anno = () => ctx.tryGet(AnnotationHostToken);

  const activate = (target: PdfLinkTarget): LinkActivation => {
    const activation = ((): LinkActivation => {
      switch (target.kind) {
        case 'goto': {
          const stage = ctx.tryGet(StageToken);
          const layout = ctx
            .document()
            ?.pages.find((p) => p.pageObjectNumber === target.destination.pageObjectNumber);
          if (!stage || !layout) {
            // No camera to drive — hand the embedder the explicit destination.
            return { outcome: 'destination', destination: target.destination };
          }
          const { pageIndex, options } = destinationToReveal(target.destination, layout);
          stage.reveal(pageIndex, { ...options, behavior: 'smooth' });
          return { outcome: 'revealed' };
        }
        case 'uri':
          // Opening is the FRAMEWORK layer's job (a real <a href> after
          // sanitizing) — this plugin never touches the DOM.
          return { outcome: 'uri', uri: target.uri };
        case 'named':
          return { outcome: 'named', name: target.name };
        default:
          // javascript / goto-remote / launch / unsupported: reported, never
          // executed here. JavaScript activation belongs to the scripting
          // orchestrator once it lands — the chain already rides the
          // annotation's base `actions`.
          return { outcome: 'reported', target };
      }
    })();
    config.onActivate?.({ target, activation });
    return activation;
  };

  return {
    linksOn: (pon) => {
      const host = anno();
      if (host) return host.linkItemsOn(pon);
      return ctx.getState().pages[pon] ?? EMPTY;
    },
    ensurePage: (pon) => {
      const host = anno();
      if (host) {
        host.ensurePage(pon); // the folded model is the source; it lazy-loads
        return;
      }
      if (!(pon in ctx.getState().pages)) loadLinksPage(ctx, pon);
    },
    engaged: () => ctx.tryGet(InteractionToken)?.activeTool()?.enables.has('link-nav') ?? false,
    activate,
  };
}
