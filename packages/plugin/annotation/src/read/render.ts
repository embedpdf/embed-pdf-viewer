import { CONTINUOUS_RENDER_POLICY, snapAppearanceScale } from '@embedpdf/core';
import {
  defaultsFor,
  isSubstrateOnly,
  pageItems as corePageItems,
  pdfToContentRect,
  styleFromProps,
  viewable,
  type Model,
  type RenderItem,
  type ViewEnv,
} from '@embedpdf/core-annotation';
import type { PageRef, PdfRect } from '@embedpdf/engine-core/runtime';

import type { LinkNavItem, TextItem } from '../contract';
import type { AnnotationState } from '../model';
import type { AnnotationContext, AnnotationServices } from '../services';
import { buildTextItems } from '../text-item';

/**
 * What a page paints: the vector items (drafts, previews and the tool ghost
 * ride the same pipeline), the editable text items, the navigable link
 * areas, and the baked-appearance seam (epoch, bake scale, rasters).
 */
export function createRenderReads(
  ctx: Pick<AnnotationContext, 'state' | 'document' | 'doc'>,
  { view: { pageModel }, geometry, tools }: Pick<AnnotationServices, 'view' | 'geometry' | 'tools'>,
) {
  const itemsCache = new Map<
    number,
    {
      model: Model;
      ghost: AnnotationState['toolGhost'];
      zoom: number | undefined;
      rotation: number | undefined;
      v: RenderItem[];
    }
  >();
  const pageItemsOf = (page: PageRef, view?: ViewEnv): RenderItem[] => {
    const pageObjectNumber = page.pageObjectNumber;
    const model = pageModel(pageObjectNumber);
    const ghost = ctx.state.get().toolGhost;
    const cached = itemsCache.get(pageObjectNumber);
    if (
      cached &&
      cached.model === model &&
      cached.ghost === ghost &&
      cached.zoom === view?.zoom &&
      cached.rotation === view?.rotation
    )
      return cached.v;
    const items = corePageItems(model, page, view);
    // The armed tool's vector footprint ghost rides the same items pipeline as
    // every draft preview (image ghosts blit through the framework instead).
    if (ghost && ghost.page.pageObjectNumber === pageObjectNumber && ghost.kind === 'vector') {
      const tool = tools.get(ghost.toolId);
      const style = styleFromProps(defaultsFor(model, tool?.preset ?? ghost.toolId));
      items.push({
        id: 'tool-ghost',
        ref: null,
        subtype: tool?.subtype ?? 'square',
        geometry: ghost.geometry,
        box: ghost.box,
        style,
        source: 'ghost',
        selected: false,
      });
    }
    itemsCache.set(pageObjectNumber, {
      model: model,
      ghost: ghost,
      zoom: view?.zoom,
      rotation: view?.rotation,
      v: items,
    });
    return items;
  };

  const textsCache = new Map<
    number,
    { model: Model; zoom: number | undefined; rotation: number | undefined; v: TextItem[] }
  >();
  const textItemsOf = (page: PageRef, view?: ViewEnv): TextItem[] => {
    const pageObjectNumber = page.pageObjectNumber;
    const model = pageModel(pageObjectNumber);
    const cached = textsCache.get(pageObjectNumber);
    if (
      cached &&
      cached.model === model &&
      cached.zoom === view?.zoom &&
      cached.rotation === view?.rotation
    )
      return cached.v;
    const items = buildTextItems(model, page, view);
    textsCache.set(pageObjectNumber, {
      model: model,
      zoom: view?.zoom,
      rotation: view?.rotation,
      v: items,
    });
    return items;
  };

  // The navigation plane's feed: clickable link areas per page — standalone
  // links + attached-link segments (rects derived by the reconciler's own
  // rule). Memoized by the page's slice of the model for selector use.
  const linkItemsCache = new Map<number, { model: Model; v: LinkNavItem[] }>();
  const linkItemsOf = (pageObjectNumber: number): LinkNavItem[] => {
    const model = pageModel(pageObjectNumber);
    const cached = linkItemsCache.get(pageObjectNumber);
    if (cached && cached.model === model) return cached.v;
    const items: LinkNavItem[] = [];
    for (const id of model.order) {
      const annotation = model.byId[id];
      if (
        !annotation ||
        annotation.page.pageObjectNumber !== pageObjectNumber ||
        annotation.subtype !== 'link'
      )
        continue;
      if (!viewable(annotation.flags, false)) continue; // hidden links don't navigate
      // Standalone links carry their own model `link` (/A); attached children
      // carry the target on their DTO. Rects are the child's own committed
      // geometry — anchors render only in view contexts, where nothing is
      // mid-gesture, so no live parent-derivation is needed.
      const target =
        annotation.link ??
        (annotation.data?.subtype === 'link' ? (annotation.data.target ?? null) : null);
      if (target == null || annotation.geometry.kind !== 'rect') continue;
      const activate = annotation.data?.actions?.activate;
      const ref = annotation.ref ?? annotation.data?.ref ?? undefined;
      const hoverEnter = Boolean(annotation.data?.actions?.cursorEnter?.root);
      const hoverExit = Boolean(annotation.data?.actions?.cursorExit?.root);
      items.push({
        id,
        bounds: annotation.geometry.rect,
        target,
        attached: annotation.group !== undefined,
        ...(activate ? { activate } : {}),
        ...(ref ? { ref } : {}),
        ...(hoverEnter || hoverExit ? { hoverEvents: { enter: hoverEnter, exit: hoverExit } } : {}),
      });
    }
    linkItemsCache.set(pageObjectNumber, { model: model, v: items });
    return items;
  };

  const api = {
    listPageItems: (page: PageRef, view?: ViewEnv) => pageItemsOf(page, view),
    listTextItems: (page: PageRef, view?: ViewEnv) => textItemsOf(page, view),
    listLinkItems: (page: PageRef) => linkItemsOf(page.pageObjectNumber),
    getAppearanceEpoch: (page: PageRef) => {
      const pageObjectNumber = page.pageObjectNumber;
      // What a baked raster depends on, and nothing else: which annotations are
      // baked on this page, and each one's /AP content version (`apVersion` —
      // bumped when a size-changing patch resolves, or a remote edit folds in).
      // Position and rotation are deliberately absent: the blit translates
      // (`apBox`) and rotates (`apRot`) the same pixels, so a move or a spin
      // costs zero re-renders — and because the version bumps when the engine
      // confirms the re-bake, the fetch can never read a stale /AP ("one
      // behind"). Render scale is the shell effect's own dependency.
      const model = pageModel(pageObjectNumber);
      const parts: string[] = [];
      for (const id of model.order) {
        const annotation = model.byId[id];
        if (
          !annotation ||
          annotation.page.pageObjectNumber !== pageObjectNumber ||
          annotation.source !== 'baked' ||
          !annotation.ref
        )
          continue;
        // Conversation-plane annotations never paint — a remote reply or
        // status change must not churn the page's raster cache key.
        if (isSubstrateOnly(annotation)) continue;
        parts.push(`${id}@${annotation.apVersion ?? 0}`);
      }
      return parts.sort().join('|');
    },
    getBakeScale: (renderScale: number) =>
      // The render policy is a document fact off the kernel registry (like
      // `pages`), interpreted by the pure engine-core helper — one lifecycle,
      // one interpretation, no plugin dependency. Identity under continuous.
      snapAppearanceScale(ctx.document()?.renderPolicy ?? CONTINUOUS_RENDER_POLICY, renderScale),
    renderAppearances: (page: PageRef, scale: number, signal?: AbortSignal) => {
      const doc = ctx.doc;
      if (!doc) return Promise.resolve([]);
      const task = doc.page(page).annotations.renderAppearanceImages({ scale });
      if (signal) {
        if (signal.aborted) task.abort(signal.reason);
        else signal.addEventListener('abort', () => task.abort(signal.reason), { once: true });
      }
      return task.then(
        (result) => result.appearances,
        () => [],
      );
    },
    pdfToPageRect: (page: PageRef, rect: PdfRect) => {
      const crop = geometry.cropOf(page.pageObjectNumber);
      return crop ? pdfToContentRect(rect, crop) : null;
    },
  };

  return { api };
}
