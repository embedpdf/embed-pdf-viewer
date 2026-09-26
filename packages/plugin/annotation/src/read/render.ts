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
  ctx: Pick<AnnotationContext, 'getState' | 'document' | 'doc'>,
  { store, geometry, tools }: Pick<AnnotationServices, 'store' | 'geometry' | 'tools'>,
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
    const pon = page.pageObjectNumber;
    const m = store.model();
    const g = ctx.getState().toolGhost;
    const c = itemsCache.get(pon);
    if (
      c &&
      c.model === m &&
      c.ghost === g &&
      c.zoom === view?.zoom &&
      c.rotation === view?.rotation
    )
      return c.v;
    const v = corePageItems(m, page, view);
    // The armed tool's VECTOR footprint ghost rides the same items pipeline as
    // every draft preview (image ghosts blit through the framework instead).
    if (g && g.page.pageObjectNumber === pon && g.kind === 'vector') {
      const tool = tools.get(g.toolId);
      const style = styleFromProps(defaultsFor(m, tool?.preset ?? g.toolId));
      v.push({
        id: 'tool-ghost',
        ref: null,
        subtype: tool?.subtype ?? 'square',
        geom: g.geom,
        box: g.box,
        style,
        source: 'ghost',
        selected: false,
      });
    }
    itemsCache.set(pon, { model: m, ghost: g, zoom: view?.zoom, rotation: view?.rotation, v });
    return v;
  };

  const textsCache = new Map<
    number,
    { model: Model; zoom: number | undefined; rotation: number | undefined; v: TextItem[] }
  >();
  const textItemsOf = (page: PageRef, view?: ViewEnv): TextItem[] => {
    const pon = page.pageObjectNumber;
    const m = store.model();
    const c = textsCache.get(pon);
    if (c && c.model === m && c.zoom === view?.zoom && c.rotation === view?.rotation) return c.v;
    const v = buildTextItems(m, page, view);
    textsCache.set(pon, { model: m, zoom: view?.zoom, rotation: view?.rotation, v });
    return v;
  };

  // The navigation plane's feed: clickable link areas per page — standalone
  // links + attached-link segments (rects derived by the reconciler's own
  // rule). Memoized by model identity for selector use.
  const linkItemsCache = new Map<number, { model: Model; v: LinkNavItem[] }>();
  const linkItemsOf = (pon: number): LinkNavItem[] => {
    const m = store.model();
    const c = linkItemsCache.get(pon);
    if (c && c.model === m) return c.v;
    const v: LinkNavItem[] = [];
    for (const id of m.order) {
      const a = m.byId[id];
      if (!a || a.page.pageObjectNumber !== pon || a.subtype !== 'link') continue;
      if (!viewable(a.flags, false)) continue; // hidden links don't navigate
      // Standalone links carry their own model `link` (/A); attached children
      // carry the target on their DTO. Rects are the CHILD's own committed
      // geometry — anchors render only in view contexts, where nothing is
      // mid-gesture, so no live parent-derivation is needed.
      const target = a.link ?? (a.data?.subtype === 'link' ? (a.data.target ?? null) : null);
      if (target == null || a.geom.t !== 'rect') continue;
      const activate = a.data?.actions?.activate;
      const ref = a.ref ?? a.data?.ref ?? undefined;
      const hoverEnter = Boolean(a.data?.actions?.cursorEnter?.root);
      const hoverExit = Boolean(a.data?.actions?.cursorExit?.root);
      v.push({
        id,
        bounds: a.geom.rect,
        target,
        attached: a.group !== undefined,
        ...(activate ? { activate } : {}),
        ...(ref ? { ref } : {}),
        ...(hoverEnter || hoverExit ? { hoverEvents: { enter: hoverEnter, exit: hoverExit } } : {}),
      });
    }
    linkItemsCache.set(pon, { model: m, v });
    return v;
  };

  const api = {
    listPageItems: (page: PageRef, view?: ViewEnv) => pageItemsOf(page, view),
    listTextItems: (page: PageRef, view?: ViewEnv) => textItemsOf(page, view),
    listLinkItems: (page: PageRef) => linkItemsOf(page.pageObjectNumber),
    getAppearanceEpoch: (page: PageRef) => {
      const pon = page.pageObjectNumber;
      // What a baked raster DEPENDS on, and nothing else: which annotations are
      // baked on this page, and each one's /AP content version (`apVersion` —
      // bumped when a size-changing patch RESOLVES, or a remote edit folds in).
      // Position and rotation are deliberately absent: the blit translates
      // (`apBox`) and rotates (`apRot`) the same pixels, so a move or a spin
      // costs zero re-renders — and because the version bumps when the engine
      // CONFIRMS the re-bake, the fetch can never read a stale /AP ("one
      // behind"). Render scale is the shell effect's own dependency.
      const m = store.model();
      const parts: string[] = [];
      for (const id of m.order) {
        const a = m.byId[id];
        if (!a || a.page.pageObjectNumber !== pon || a.source !== 'baked' || !a.ref) continue;
        // Conversation-plane annotations never paint — a remote reply or
        // status change must not churn the page's raster cache key.
        if (isSubstrateOnly(a)) continue;
        parts.push(`${id}@${a.apVersion ?? 0}`);
      }
      return parts.sort().join('|');
    },
    getBakeScale: (renderScale: number) =>
      // The render policy is a document FACT off the kernel registry (like
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
        (r) => r.appearances,
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
