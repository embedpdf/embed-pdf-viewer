import {
  createEventHook,
  pageRefsEqual,
  type ChangeOrigin,
  type DocumentEvent,
  type PageRef,
  type PluginContext,
} from '@embedpdf/core';
import type { Point } from '@embedpdf/core-geometry';
import type { PdfLinkTarget } from '@embedpdf/engine-core/runtime';
import { ActionsToken } from '@embedpdf/plugin-actions/contract';
import { AnnotationToken as AnnotationHostToken } from '@embedpdf/plugin-annotation/contract/host';
import { InteractionToken } from '@embedpdf/plugin-interaction/contract';
import { StageToken } from '@embedpdf/plugin-stage/contract';
import { destinationToReveal } from '@embedpdf/plugin-stage/destination';
import { loadLinksPage } from './source';
import type {
  Link,
  LinkAction,
  LinkActivateContext,
  LinkActivatedEvent,
  LinkActivation,
  LinkHostCapability,
  LinkLoadedEvent,
  LinkResolution,
  LinkState,
} from './types';

const EMPTY: readonly Link[] = Object.freeze([]);
const USER_ORIGIN: ChangeOrigin = {
  locality: 'local',
  trigger: 'user',
  sessionId: null,
  actorId: null,
};

const isLink = (value: PdfLinkTarget | Link): value is Link =>
  'target' in value && 'bounds' in value;
const contains = (b: { x: number; y: number; width: number; height: number }, p: Point): boolean =>
  p.x >= b.x && p.x <= b.x + b.width && p.y >= b.y && p.y <= b.y + b.height;

/**
 * The link controller. Two sources for the clickable areas: the annotation
 * plugin's folded model when it is installed (always current), else this
 * plugin's own per-page reads. Activation is pure resolution (`resolve`)
 * plus the one side effect this plugin owns — a stage reveal; everything
 * else is reported to the host, which keeps the user gesture.
 */
export function createLinkController(ctx: PluginContext<LinkState, LinkAction>) {
  const anno = () => ctx.tryGet(AnnotationHostToken);
  const reportListener = (error: unknown) => console.error('[link] event listener failed:', error);
  const activated = createEventHook<LinkActivatedEvent>(reportListener);
  const loaded = createEventHook<LinkLoadedEvent>(reportListener);
  ctx.cleanup(() => {
    activated.dispose();
    loaded.dispose();
  });

  const listLinks = (page: PageRef): readonly Link[] => {
    const host = anno();
    if (host) return host.listLinkItems(page);
    return ctx.getState().pages[page.pageObjectNumber] ?? EMPTY;
  };
  const isLoaded = (page: PageRef): boolean =>
    anno() !== null || page.pageObjectNumber in ctx.getState().pages;

  const loads = new Map<number, Promise<void>>();
  const ensureLoaded = (page: PageRef): Promise<void> => {
    if (anno()) return Promise.resolve(); // the annotation model owns the data
    const pon = page.pageObjectNumber;
    if (pon in ctx.getState().pages) return Promise.resolve();
    const inFlight = loads.get(pon);
    if (inFlight) return inFlight;
    const load = loadLinksPage(ctx, page).then(() => {
      loads.delete(pon);
      if (pon in ctx.getState().pages) loaded.emit({ page });
    });
    loads.set(pon, load);
    return load;
  };

  const resolve = (target: PdfLinkTarget): LinkResolution => {
    switch (target.kind) {
      case 'goto': {
        const layout = ctx
          .document()
          ?.pages.find((p) => pageRefsEqual(p.ref, target.destination.page));
        if (!layout) return { kind: 'destination', destination: target.destination };
        const { pageIndex, options } = destinationToReveal(target.destination, layout);
        return { kind: 'reveal', page: target.destination.page, pageIndex, options };
      }
      case 'uri':
        return { kind: 'uri', uri: target.uri };
      case 'named':
        return { kind: 'named', name: target.name };
      default:
        return { kind: 'reported', target };
    }
  };

  const activate = (input: PdfLinkTarget | Link, context?: LinkActivateContext): LinkActivation => {
    const target = isLink(input) ? input.target : input;
    const ctxOf: LinkActivateContext | undefined = isLink(input)
      ? { activate: input.activate, ref: input.ref, ...context }
      : context;
    const activation = ((): LinkActivation => {
      const actions = ctx.tryGet(ActionsToken);
      if (actions && ctxOf?.activate) {
        const dispatch = actions.execute(ctxOf.activate, {
          origin: 'user',
          source: { kind: 'link', annotation: ctxOf.ref, page: ctxOf.page },
          event: { scope: 'activate' },
        });
        return { outcome: 'dispatched', dispatch };
      }
      const resolution = resolve(target);
      switch (resolution.kind) {
        case 'reveal': {
          const stage = ctx.tryGet(StageToken);
          if (!stage || target.kind !== 'goto') {
            return target.kind === 'goto'
              ? { outcome: 'destination', destination: target.destination }
              : { outcome: 'reported', target };
          }
          stage.revealIndex(resolution.pageIndex, { ...resolution.options, behavior: 'smooth' });
          return { outcome: 'revealed' };
        }
        case 'destination':
          return { outcome: 'destination', destination: resolution.destination };
        case 'uri':
          return { outcome: 'uri', uri: resolution.uri };
        case 'named':
          return { outcome: 'named', name: resolution.name };
        default:
          return { outcome: 'reported', target };
      }
    })();
    activated.emit({ target, activation, origin: USER_ORIGIN });
    return activation;
  };

  const getLinkAt = (page: PageRef, point: Point): Link | null => {
    let best: Link | null = null;
    for (const link of listLinks(page)) {
      if (!contains(link.bounds, point)) continue;
      if (
        !best ||
        link.bounds.width * link.bounds.height < best.bounds.width * best.bounds.height
      ) {
        best = link;
      }
    }
    return best;
  };

  const getLabel = (input: Link | PdfLinkTarget): string => {
    const target = isLink(input) ? input.target : input;
    switch (target.kind) {
      case 'uri':
        return target.uri;
      case 'goto':
        return 'Go to destination';
      case 'named':
        return target.name;
      default:
        return 'Link';
    }
  };

  const api: LinkHostCapability = {
    listLinks,
    getLink: (page, linkId) => listLinks(page).find((l) => l.id === linkId) ?? null,
    getLinkAt,
    listAllLinks: async () => {
      const pages = ctx.document()?.pages ?? [];
      await Promise.all(pages.map((p) => ensureLoaded(p.ref)));
      return pages.flatMap((p) => listLinks(p.ref));
    },
    ensureLoaded,
    isLoaded,
    resolve,
    activate,
    activateAt: (page, point, context) => {
      const link = getLinkAt(page, point);
      return link ? activate(link, { page, ...context }) : null;
    },
    getLabel,
    onActivated: activated.on,
    onLoaded: loaded.on,
    isNavigationEngaged: () =>
      ctx.tryGet(InteractionToken)?.getActiveTool()?.enables.has('link-nav') ?? false,
  };

  return {
    api,
    connect() {
      // Stand-alone source only: a confirmed annotation change re-reads the
      // page it touched (the annotation model owns the data otherwise).
      const refetch = (page: PageRef): void => {
        if (anno()) return;
        if (page.pageObjectNumber in ctx.getState().pages) {
          void loadLinksPage(ctx, page).then(() => loaded.emit({ page }));
        }
      };
      const off = ctx.doc?.events.subscribe((event: DocumentEvent) => {
        switch (event.type) {
          case 'annotation.created':
            refetch(event.created.page);
            break;
          case 'annotation.updated':
            refetch(event.updated.page);
            break;
          case 'annotation.moved':
            if (event.moved.length) refetch(event.moved[0]!.page);
            break;
          case 'annotation.deleted':
            refetch(event.page);
            break;
          default:
            break;
        }
      });
      if (off) ctx.cleanup(off);
    },
  };
}
