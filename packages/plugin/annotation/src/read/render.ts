import { CONTINUOUS_RENDER_POLICY, snapAppearanceScale } from '@embedpdf/core';
import {
  fieldsOf,
  groupOf,
  isSubstrateOnly,
  kindOf,
  type Model,
  pageItems as corePageItems,
  refOf,
  type RenderItem,
  toolStyleOf,
  viewable,
  type ViewEnv,
} from '@embedpdf/core-annotation';
import type { PageRef } from '@embedpdf/engine-core/runtime';

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
  { view: { pageModel }, tools }: Pick<AnnotationServices, 'view' | 'tools'>,
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
    const pageObjectNumber = page.objectNumber;
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
    if (ghost && ghost.page.objectNumber === pageObjectNumber && ghost.kind === 'vector') {
      const tool = tools.get(ghost.toolId);
      const { style } = toolStyleOf(model, tool?.subtype ?? ghost.toolId, tool?.preset);
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
    const pageObjectNumber = page.objectNumber;
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
        annotation.annotation.page.objectNumber !== pageObjectNumber ||
        kindOf(annotation.annotation).name !== 'link'
      )
        continue;
      if (!viewable(annotation.annotation, false)) continue; // hidden links don't navigate
      // Standalone links carry their own model `link` (/A); attached children
      // carry the target on their DTO. Rects are the child's own committed
      // geometry — anchors render only in view contexts, where nothing is
      // mid-gesture, so no live parent-derivation is needed.
      const record = annotation.annotation;
      const { link, geometry } = fieldsOf(annotation);
      const target = link ?? (record.subtype === 'link' ? (record.target ?? null) : null);
      if (target == null || geometry.kind !== 'box') continue;
      const activate = record.actions?.activate;
      const ref = refOf(annotation) ?? undefined;
      const hoverEnter = Boolean(record.actions?.cursorEnter?.root);
      const hoverExit = Boolean(record.actions?.cursorExit?.root);
      items.push({
        id,
        bounds: geometry.box,
        target,
        attached: groupOf(annotation.annotation) !== undefined,
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
    listLinkItems: (page: PageRef) => linkItemsOf(page.objectNumber),
    getAppearanceEpoch: (page: PageRef) => {
      const pageObjectNumber = page.objectNumber;
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
          annotation.annotation.page.objectNumber !== pageObjectNumber ||
          annotation.source !== 'baked' ||
          !refOf(annotation)
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
      const task = doc
        .page(page)
        .annotations.renderAppearances({ viewport: { kind: 'scale', scale } });
      if (signal) {
        if (signal.aborted) task.abort(signal.reason);
        else signal.addEventListener('abort', () => task.abort(signal.reason), { once: true });
      }
      return task.then(
        (result) => result.appearances,
        () => [],
      );
    },
  };

  return { api };
}
