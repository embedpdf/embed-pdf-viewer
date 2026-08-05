import {
  CONTINUOUS_RENDER_POLICY,
  snapFullPageViewport,
  type EngineRenderPolicy,
  type PageObjectNumber,
  type PageRenderViewport,
  type PluginContext,
} from '@embedpdf/core';

import { resolveTiling } from './paint-plan';
import { RasterStore } from './raster-store';
import { TileManager } from './tile-manager';
import type { RenderAction, RenderCapability, RenderPluginOptions, RenderState } from './types';

/**
 * The render capability: the ONE policy consumer in the client stack
 * (the three-layer rule). The engine never snaps; framework
 * layers never see the policy; everything between — conforming a desired
 * scale to the deployment lattice, collapsing same-rung asks in the raster
 * store, exposing stable source keys — happens here.
 */
export function createRenderCapability(
  ctx: PluginContext<RenderState, RenderAction>,
  options: RenderPluginOptions = {},
): RenderCapability {
  // Document-lifetime cache; keys embed the canonical viewport + epoch, so
  // the lattice is the cache axis and staleness is a new key, never a flush.
  const store = new RasterStore();

  // The policy is a DOCUMENT FACT on the kernel's registry — materialized
  // before publish (one lifecycle, in the kernel), interpreted by the pure
  // engine-core snap helpers (one interpretation). This plugin just reads it.
  const policy = (): EngineRenderPolicy => ctx.document()?.renderPolicy ?? CONTINUOUS_RENDER_POLICY;

  const pageOf = (pon: PageObjectNumber) =>
    (ctx.document()?.pages ?? []).find((p) => p.pageObjectNumber === pon);

  const pageWidthOf = (pon: PageObjectNumber): number => {
    const page = pageOf(pon);
    if (!page) throw new Error(`render: unknown page object number ${pon}`);
    return page.size.width;
  };

  const conformViewport = (pon: PageObjectNumber, scale: number): PageRenderViewport => {
    const p = policy();
    if (p.kind !== 'lattice') return { kind: 'scale', scale };
    // scale × pageWidth = desired device width; the ONE snap implementation
    // converts and snaps UP to the canonical ladder width.
    return snapFullPageViewport(p, { kind: 'scale', scale }, { pageWidth: pageWidthOf(pon) });
  };

  const viewportKey = (viewport: PageRenderViewport): string =>
    viewport.kind === 'width' ? `w${viewport.width}` : `s${viewport.scale ?? 1}`;

  const epochOf = (pon: PageObjectNumber, includeAnnotations: boolean): number => {
    const s = ctx.getState();
    const content = s.contentEpochs[pon] ?? 0;
    if (!includeAnnotations) return content;
    return content + (s.annotatedEpochs[pon] ?? 0);
  };

  // Tiling shares THIS store, THIS policy, THIS ledger — one scheduler,
  // one budget, one invalidation truth.
  const tiles = new TileManager({
    store,
    config: resolveTiling(options.tiling),
    getPolicy: policy,
    getPageSize: (pon) => pageOf(pon)?.size,
    getEpoch: epochOf,
    fetchTile: (pon, rect, scale, includeAnnotations, signal) => {
      const doc = ctx.doc;
      if (!doc) return Promise.reject(new Error('render: no document bound'));
      const task = doc.page(pon).render.image({
        target: { kind: 'rect', rect },
        viewport: { kind: 'scale', scale },
        includeAnnotations,
      });
      if (signal.aborted) task.abort(signal.reason);
      else signal.addEventListener('abort', () => task.abort(signal.reason), { once: true });
      return task;
    },
    onAdvance: (pon) => ctx.dispatch({ type: 'PAINT_ADVANCED', pon }),
  });

  return {
    renderPage(pon, { scale, includeAnnotations, signal }) {
      const doc = ctx.doc;
      if (!doc) return Promise.reject(new Error('render: no document bound'));
      const annotations = includeAnnotations ?? true;
      const viewport = conformViewport(pon, scale);
      const key = `${pon}|${viewportKey(viewport)}|a${annotations ? 1 : 0}|e${epochOf(pon, annotations)}`;
      return store.acquire(
        key,
        (storeSignal) => {
          const task = doc.page(pon).render.image({ viewport, includeAnnotations: annotations });
          if (storeSignal.aborted) task.abort(storeSignal.reason);
          else
            storeSignal.addEventListener('abort', () => task.abort(storeSignal.reason), {
              once: true,
            });
          return task; // AbortablePromise<PageImageHandle> is a Promise<PageImageHandle>
        },
        signal,
      );
    },
    renderSourceKey(pon, { scale, includeAnnotations }) {
      const annotations = includeAnnotations ?? true;
      const viewport = conformViewport(pon, scale);
      return `${pon}|${viewportKey(viewport)}|a${annotations ? 1 : 0}|e${epochOf(pon, annotations)}`;
    },
    conformViewport,
    renderPolicy: policy,
    tilePlan(pon, demand, opts) {
      return tiles.plan(pon, demand, opts?.includeAnnotations ?? true);
    },
    tilePainted(pon, key) {
      tiles.sourcePainted(pon, key);
    },
    releaseTiles(pon) {
      tiles.releasePage(pon);
    },
    renderEpoch(pon, includeAnnotations = true) {
      // The sum of two monotonic counters is itself a valid monotonic version:
      // a content bump reaches BOTH products; an annotation bump only this one.
      return epochOf(pon, includeAnnotations);
    },
    invalidate({ pons, scope = 'content' } = {}) {
      const target = pons ?? (ctx.document()?.pages ?? []).map((p) => p.pageObjectNumber);
      if (target.length) ctx.dispatch({ type: 'INVALIDATE', scope, pons: target });
    },
  };
}
