import { PluginError, type PluginContext, type DocumentEvent, type PageRef } from '@embedpdf/core';
import type { Point } from '@embedpdf/core-geometry';
import type { PdfLinkTarget } from '@embedpdf/engine-core/runtime';
import { ActionsToken } from '@embedpdf/plugin-actions/contract';
import { AnnotationToken as AnnotationHostToken } from '@embedpdf/plugin-annotation/contract/host';
import { InteractionToken } from '@embedpdf/plugin-interaction/contract';
import { StageToken } from '@embedpdf/plugin-stage/contract';
import { destinationToReveal } from '@embedpdf/plugin-stage/destination';

import { connectLink } from './connect';
import type {
  Link,
  LinkActivateContext,
  LinkActivatedEvent,
  LinkActivation,
  LinkLoadedEvent,
  LinkResolution,
} from './contract';
import type { LinkHostCapability } from './host-contract';
import { linksOf } from './source';

const EMPTY: readonly Link[] = Object.freeze([]);

const isLink = (value: PdfLinkTarget | Link): value is Link =>
  'target' in value && 'bounds' in value;
const contains = (
  bounds: { x: number; y: number; width: number; height: number },
  point: Point,
): boolean =>
  point.x >= bounds.x &&
  point.x <= bounds.x + bounds.width &&
  point.y >= bounds.y &&
  point.y <= bounds.y + bounds.height;

/** The pages whose annotation lists an event changed, each once. */
function pagesChangedBy(event: DocumentEvent): readonly PageRef[] | null {
  switch (event.type) {
    case 'annotation.created':
      return [event.annotation.page];
    case 'annotation.updated':
      return [event.annotation.page];
    case 'annotation.deleted':
      return [event.page];
    case 'annotation.moved': {
      const pages = new Map<number, PageRef>();
      for (const dto of event.annotations) pages.set(dto.page.pageObjectNumber, dto.page);
      return [...pages.values()];
    }
    // These can remove annotations, links included, from the pages they applied to.
    case 'redaction.applied':
    case 'pages.flattened':
      return event.results
        .filter((result) => result.status === 'applied')
        .map((result) => result.page);
    case 'annotations.flattened':
      return event.results.some((result) => result.status === 'applied') ? [event.page] : null;
    default:
      return null;
  }
}

/**
 * The link controller. Two sources for the clickable areas: the annotation
 * plugin's folded model when it is installed (always current), else a page
 * mirror of this plugin's own per-page reads, re-read when a confirmed
 * change (an annotation write, a redaction, a flatten) touches a loaded page. Activation is pure resolution
 * (`resolve`) plus the one side effect this plugin owns, a stage reveal;
 * everything else is reported to the host, which keeps the user gesture.
 */
export function createLinkController(ctx: PluginContext<void>) {
  const annotationHost = () => ctx.tryGet(AnnotationHostToken);
  const activated = ctx.events.source<LinkActivatedEvent>();
  const loaded = ctx.events.source<LinkLoadedEvent>();

  const pages = ctx.pageMirror<readonly Link[]>({
    name: 'links',
    load: async (doc, page) => {
      const layout = ctx.getPage(page);
      if (!layout) {
        throw new PluginError(
          'not-found',
          'link',
          `page ${page.pageObjectNumber} is not in this document`,
        );
      }
      const snapshot = await doc.page(page).annotations.list();
      return linksOf(snapshot.annotations, page, layout.boxes.crop);
    },
    affected: pagesChangedBy,
    changed: ({ page, cause }) => {
      if (cause === 'load') loaded.emit({ page });
    },
  });

  const listLinks = (page: PageRef): readonly Link[] => {
    const host = annotationHost();
    if (host) return host.listLinkItems(page);
    return pages.get(page) ?? EMPTY;
  };

  const ensureLoaded = (page: PageRef): Promise<void> =>
    // With the annotation plugin installed, its model owns the data.
    annotationHost() ? Promise.resolve() : pages.ensureLoaded(page);

  const resolve = (target: PdfLinkTarget): LinkResolution => {
    switch (target.kind) {
      case 'goto': {
        const layout = ctx.getPage(target.destination.page);
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

  const perform = (target: PdfLinkTarget, context?: LinkActivateContext): LinkActivation => {
    const actions = ctx.tryGet(ActionsToken);
    if (actions && context?.activate) {
      const dispatch = actions.execute(context.activate, {
        origin: 'user',
        source: { kind: 'link', annotation: context.ref, page: context.page },
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
  };

  const activate = (input: PdfLinkTarget | Link, context?: LinkActivateContext): LinkActivation => {
    const target = isLink(input) ? input.target : input;
    const linkContext: LinkActivateContext | undefined = isLink(input)
      ? { activate: input.activate, ref: input.ref, ...context }
      : context;
    const activation = perform(target, linkContext);
    activated.emit({ target, activation });
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
    getLink: (page, linkId) => listLinks(page).find((link) => link.id === linkId) ?? null,
    getLinkAt,
    listAllLinks: async () => {
      const layouts = ctx.document()?.pages ?? [];
      await Promise.all(layouts.map((layout) => ensureLoaded(layout.ref)));
      return layouts.flatMap((layout) => listLinks(layout.ref));
    },
    ensureLoaded,
    isLoaded: (page) => annotationHost() !== null || pages.getStatus(page) === 'ready',
    getStatus: (page) => (annotationHost() ? 'ready' : pages.getStatus(page)),
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
      connectLink(ctx);
    },
  };
}
