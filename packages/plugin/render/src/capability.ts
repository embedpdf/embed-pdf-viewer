import {
  CONTINUOUS_RENDER_POLICY,
  PermissionDenied,
  type EngineRenderPolicy,
  type PageObjectNumber,
  type PageRenderViewport,
  type PluginContext,
} from '@embedpdf/core';

import { resolveRenderOptions, type ResolvedRenderOptions } from './paint-plan';
import { RasterStore } from './raster-store';
import { baseAskWidth, resolveStrategy, type ResolvedStrategy } from './strategy';
import { TileManager } from './tile-manager';
import type {
  RenderAction,
  RenderCapability,
  RenderPluginOptions,
  RenderState,
  ViewTiles,
} from './types';

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

  // The twin (PERMISSIONS.md). Both fetch seams below consult it, so a
  // denied session never spends engine round-trips on doomed rasters.
  const canRender = (): boolean => ctx.doc?.security.allows('doc.render') ?? false;

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

  // A raster's identity includes its encode format: the cloud policy arrives
  // async after open, so the resolved format can change under a live store —
  // the key must change with it. Absent format (engine default) adds nothing,
  // keeping default-local keys stable.
  const baseKey = (
    pon: PageObjectNumber,
    viewport: PageRenderViewport,
    annotations: boolean,
  ): string => {
    const format = strategy().format;
    return (
      `${pon}|w${viewport.kind === 'width' ? viewport.width : 0}` +
      `|a${annotations ? 1 : 0}|e${epochOf(pon, annotations)}${format ? `|f${format}` : ''}`
    );
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
  // View-scoped tile handles (see RenderCapability.tilesFor).
  const viewTiles = new Map<string, ViewTiles>();

  const tiles = new TileManager({
    store,
    options: resolved,
    getPolicy: policy,
    getPageSize: (pon) => pageOf(pon)?.size,
    getEpoch: epochOf,
    fetchTile: (pon, rect, scale, includeAnnotations, signal) => {
      const doc = ctx.doc;
      if (!doc) return Promise.reject(new Error('render: no document bound'));
      // Same refusal the engine would send, without the round trip — a denied
      // session's viewport would otherwise 403 once per tile, forever.
      if (!canRender()) return Promise.reject(new PermissionDenied('doc.render', 'render.tile'));
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
    ...(resolved.debug
      ? { debug: (msg: string) => console.debug(`[render] ${msg}`) }
      : {}),
  });

  return {
    canRender,
    renderPage(pon, { scale, includeAnnotations, signal }) {
      const doc = ctx.doc;
      if (!doc) return Promise.reject(new Error('render: no document bound'));
      if (!canRender())
        return Promise.reject(new PermissionDenied('doc.render', 'render.renderPage'));
      const annotations = includeAnnotations ?? true;
      const viewport = conformViewport(pon, scale);
      const key = baseKey(pon, viewport, annotations);
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
      return baseKey(pon, conformViewport(pon, scale), annotations);
    },
    conformViewport,
    paintSettings() {
      return {
        fadeMs: resolved.tiles.fadeMs,
        tiles: resolved.tiles.enabled,
      };
    },
    renderPolicy: policy,
    tilesFor(view) {
      // One handle per view, reference-stable (a clean hook dependency); the
      // map lives for the document, like the state it scopes.
      let handle = viewTiles.get(view);
      if (!handle) {
        handle = {
          plan: (pon, demand, opts) => tiles.plan(view, pon, demand, opts?.includeAnnotations ?? true),
          painted: (pon, key) => tiles.sourcePainted(view, pon, key),
          unpainted: (pon, key) => tiles.sourceUnpainted(view, pon, key),
          release: (pon) => tiles.releasePage(view, pon),
        };
        viewTiles.set(view, handle);
      }
      return handle;
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
