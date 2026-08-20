import {
  CONTINUOUS_RENDER_POLICY,
  type EngineRenderPolicy,
  type PageObjectNumber,
  type PageRenderViewport,
  type PluginContext,
} from '@embedpdf/core';

import { resolveRenderOptions, type ResolvedRenderOptions } from './paint-plan';
import { RasterStore } from './raster-store';
import { baseAskWidth, resolveStrategy, type ResolvedStrategy } from './strategy';
import { TileManager } from './tile-manager';
import type { RenderAction, RenderCapability, RenderPluginOptions, RenderState } from './types';

/**
 * The render capability: the ONE place STRATEGY (plugin options — what the
 * viewer spends) composes with POLICY (the engine fact — what the deployment
 * serves). The engine never snaps; framework layers never see either;
 * everything between — conforming demand to the resolved render points,
 * collapsing same-key asks in the raster store, exposing stable source
 * keys — happens here.
 */
export function createRenderCapability(
  ctx: PluginContext<RenderState, RenderAction>,
  options: RenderPluginOptions = {},
): RenderCapability {
  const resolved: ResolvedRenderOptions = resolveRenderOptions(options);

  // Document-lifetime cache; keys embed the conformed width + epoch, so
  // the render points are the cache axis and staleness is a new key, never
  // a flush.
  const store = new RasterStore();

  // The policy is a DOCUMENT FACT on the kernel's registry — materialized
  // before publish (one lifecycle, in the kernel). This plugin composes it
  // with the strategy once per policy reference.
  const policy = (): EngineRenderPolicy => ctx.document()?.renderPolicy ?? CONTINUOUS_RENDER_POLICY;
  let strategyMemo: { policy: EngineRenderPolicy; strategy: ResolvedStrategy } | null = null;
  const strategy = (): ResolvedStrategy => {
    const p = policy();
    if (strategyMemo?.policy !== p) {
      strategyMemo = { policy: p, strategy: resolveStrategy(p, resolved) };
      warnDroppedFormat(strategyMemo.strategy);
    }
    return strategyMemo.strategy;
  };

  // One-shot developer hints — misconfigurations, not errors.
  let warnedFormat = false;
  const warnDroppedFormat = (s: ResolvedStrategy) => {
    if (warnedFormat || resolved.format === undefined || s.format === resolved.format) return;
    warnedFormat = true;
    console.warn(
      `[render] format '${resolved.format}' is not in the deployment's formats — using '${s.format}'.`,
    );
  };
  let warnedBudget = false;
  const warnPastBudgetNoTiles = (demandWidth: number, supplied: number) => {
    if (warnedBudget || resolved.tiles.enabled || demandWidth <= supplied * 2) return;
    warnedBudget = true;
    console.warn(
      `[render] demand is ${(demandWidth / supplied).toFixed(1)}× over the base budget and the ` +
        `tile plane is disabled (tiles: false) — the page rests blurry. Raise fullPage.maxWidth ` +
        `or re-enable tiles.`,
    );
  };

  const pageOf = (pon: PageObjectNumber) =>
    (ctx.document()?.pages ?? []).find((p) => p.pageObjectNumber === pon);

  const pageWidthOf = (pon: PageObjectNumber): number => {
    const page = pageOf(pon);
    if (!page) throw new Error(`render: unknown page object number ${pon}`);
    return page.size.width;
  };

  // The ONE base-sizing path — renderPage, renderSourceKey, conformViewport,
  // and (via the tile manager) engagement all go through baseAskWidth.
  const conformViewport = (pon: PageObjectNumber, scale: number): PageRenderViewport => {
    const s = strategy();
    const demandWidth = scale * pageWidthOf(pon);
    const width = baseAskWidth(s, demandWidth);
    warnPastBudgetNoTiles(demandWidth, width);
    return { kind: 'width', width };
  };

  const epochOf = (pon: PageObjectNumber, includeAnnotations: boolean): number => {
    const s = ctx.getState();
    const content = s.contentEpochs[pon] ?? 0;
    if (!includeAnnotations) return content;
    return content + (s.annotatedEpochs[pon] ?? 0);
  };

  // Tile resolutions arrive in bursts (a want set landing) — coalesce the
  // wake-ups per frame so N arrivals become one plan bump, one commit.
  const pendingAdvance = new Set<PageObjectNumber>();
  let advanceScheduled = false;
  const raf: (cb: () => void) => void =
    typeof requestAnimationFrame === 'function'
      ? (cb) => requestAnimationFrame(() => cb())
      : (cb) => void setTimeout(cb, 16);
  const wake = (pon: PageObjectNumber) => {
    pendingAdvance.add(pon);
    if (advanceScheduled) return;
    advanceScheduled = true;
    raf(() => {
      advanceScheduled = false;
      const pons = [...pendingAdvance];
      pendingAdvance.clear();
      for (const p of pons) ctx.dispatch({ type: 'PAINT_ADVANCED', pon: p });
    });
  };

  // Tiling shares THIS store, THIS strategy, THIS ledger — one scheduler,
  // one budget, one invalidation truth.
  const tiles = new TileManager({
    store,
    options: resolved,
    getPolicy: policy,
    getPageSize: (pon) => pageOf(pon)?.size,
    getEpoch: epochOf,
    fetchTile: (pon, rect, scale, includeAnnotations, signal) => {
      const doc = ctx.doc;
      if (!doc) return Promise.reject(new Error('render: no document bound'));
      const s = strategy();
      const task = doc.page(pon).render.image({
        target: { kind: 'rect', rect },
        viewport: { kind: 'scale', scale },
        includeAnnotations,
        ...(s.format !== undefined ? { format: s.format } : {}),
        ...(s.quality !== undefined ? { quality: s.quality } : {}),
      });
      if (signal.aborted) task.abort(signal.reason);
      else signal.addEventListener('abort', () => task.abort(signal.reason), { once: true });
      return task;
    },
    onAdvance: wake,
  });

  return {
    renderPage(pon, { scale, includeAnnotations, signal }) {
      const doc = ctx.doc;
      if (!doc) return Promise.reject(new Error('render: no document bound'));
      const annotations = includeAnnotations ?? true;
      const viewport = conformViewport(pon, scale);
      const key = `${pon}|w${viewport.kind === 'width' ? viewport.width : 0}|a${annotations ? 1 : 0}|e${epochOf(pon, annotations)}`;
      return store.acquire(
        key,
        (storeSignal) => {
          const s = strategy();
          const task = doc.page(pon).render.image({
            viewport,
            includeAnnotations: annotations,
            ...(s.format !== undefined ? { format: s.format } : {}),
            ...(s.quality !== undefined ? { quality: s.quality } : {}),
          });
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
      return `${pon}|w${viewport.kind === 'width' ? viewport.width : 0}|a${annotations ? 1 : 0}|e${epochOf(pon, annotations)}`;
    },
    conformViewport,
    paintSettings() {
      return {
        settleMs: resolved.tiles.settleMs,
        fadeMs: resolved.tiles.fadeMs,
        tiles: resolved.tiles.enabled,
      };
    },
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
