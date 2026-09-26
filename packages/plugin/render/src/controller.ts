import {
  CONTINUOUS_RENDER_POLICY,
  PluginError,
  isPluginError,
  memo,
  originOf,
  toPageRef,
  toPluginError,
  toPluginErrorInfo,
  type BatchResult,
  type ChangeOrigin,
  type PluginContext,
  type DocCapability,
  type EngineRenderPolicy,
  type PageImageHandle,
  type PageObjectNumber,
  type PageRef,
  type PageRenderViewport,
  type PluginErrorInfo,
} from '@embedpdf/core';
import type { Rect } from '@embedpdf/core-geometry';
import type {
  InvalidateOptions,
  InvalidateScope,
  PageRender,
  RenderConfig,
  RenderFormat,
  RenderInvalidatedEvent,
  RenderPageOptions,
  RenderPagesOptions,
} from './contract';
import type {
  PaintSettings,
  RenderCompletedEvent,
  RenderFailedEvent,
  RenderHostCapability,
  ViewDemand,
} from './host-contract';
import { pixelChangeOf } from './invalidation';
import { invalidatePages, renderEpochOf, type RenderState } from './model';
import {
  EMPTY_TILE_PLAN,
  resolveRenderOptions,
  type PageViewDemand,
  type ResolvedRenderOptions,
  type TilePaintPlan,
} from './paint-plan';
import { RasterStore } from './raster-store';
import { baseAskWidth, resolveStrategy, type ResolvedStrategy } from './strategy';
import { TileManager } from './tile-manager';

const RENDER_SCOPE: DocCapability = 'doc.render';
/** An abort reason the engine task accepts (signals carry `unknown`). */
const reasonOf = (signal: AbortSignal): string | undefined =>
  typeof signal.reason === 'string' ? signal.reason : undefined;
const DEFAULT_BATCH_CONCURRENCY = 4;

/** A view's live demand for one page, as last set through its handle. */
interface PageDemand {
  demand: PageViewDemand;
  includeAnnotations: boolean;
  plan: TilePaintPlan;
}

/**
 * The render controller: the one place strategy (config: what the viewer
 * spends) composes with policy (the engine fact: what the deployment
 * serves). The engine never snaps and layers never see either; everything
 * between happens here: conforming demand to the resolved render points,
 * collapsing same-key asks in the raster store, exposing stable source keys,
 * and turning a view's demand into a retention-safe tile plan.
 *
 * Two doors for rasters: `renderPage` (public, exact size) and
 * `renderSource` (host, conformed). Both share the raster store, so a
 * developer's thumbnail and the rail's base plane never render twice.
 *
 * Two doors for staleness: confirmed document events (see `connect`) and
 * the `invalidate` verb. Both go through `publishInvalidation`, the one
 * place the ledger bumps and `onInvalidated` fires.
 *
 * The tile manager and the per-view plans live outside state (they hold
 * live handles and abort controllers); a re-plan wakes readers with
 * `ctx.notify()`.
 */
export function createRenderController(
  ctx: PluginContext<RenderState>,
  config: RenderConfig = {},
) {
  const resolved: ResolvedRenderOptions = resolveRenderOptions(config);
  const store = new RasterStore();
  const invalidated = ctx.events.source<RenderInvalidatedEvent>();
  const renderCompleted = ctx.events.source<RenderCompletedEvent>();
  const renderFailed = ctx.events.source<RenderFailedEvent>();

  const canRender = (): boolean => ctx.doc.security.allows(RENDER_SCOPE);
  const permissionDenied = (operation: string): PluginError =>
    new PluginError('permission-denied', 'render', `${operation} requires ${RENDER_SCOPE}`, {
      details: { required: RENDER_SCOPE },
    });
  const assertCanRender = (operation: string): void => {
    if (!canRender()) throw permissionDenied(operation);
  };

  // One-shot developer hints: misconfigurations, not errors.
  let warnedFormat = false;
  const warnDroppedFormat = (strategy: ResolvedStrategy) => {
    if (warnedFormat || resolved.format === undefined || strategy.format === resolved.format) {
      return;
    }
    warnedFormat = true;
    console.warn(
      `[render] format '${resolved.format}' is not in the deployment's formats — using '${strategy.format}'.`,
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

  // ── strategy ∧ policy ──
  // The policy is a document fact on the kernel's registry, materialized
  // before publish. Composed with the strategy once per policy reference.
  const renderPolicy = (): EngineRenderPolicy =>
    ctx.document()?.renderPolicy ?? CONTINUOUS_RENDER_POLICY;
  const currentStrategy = memo(
    () => [renderPolicy()],
    (policy) => {
      const strategy = resolveStrategy(policy, resolved);
      warnDroppedFormat(strategy);
      return strategy;
    },
  );

  // ── pages ──
  const pageWidthOf = (page: PageRef): number => {
    const info = ctx.getPage(page);
    if (!info) ctx.assertPageRef(page); // throws not-found
    return info!.size.width;
  };
  const allPageObjectNumbers = (): PageObjectNumber[] =>
    (ctx.document()?.pages ?? []).map((info) => info.ref.pageObjectNumber);

  // The one base-sizing path: renderSource, getSourceKey, conformViewport,
  // and (through the tile manager) engagement all go through baseAskWidth.
  const conformViewport = (page: PageRef, scale: number): PageRenderViewport => {
    const demandWidth = scale * pageWidthOf(page);
    const width = baseAskWidth(currentStrategy(), demandWidth);
    warnPastBudgetNoTiles(demandWidth, width);
    return { kind: 'width', width };
  };

  const epochOf = (pageObjectNumber: PageObjectNumber, includeAnnotations: boolean): number =>
    renderEpochOf(ctx.state.get(), pageObjectNumber, includeAnnotations);

  // A raster's identity includes its encode format: the cloud policy arrives
  // asynchronously after open, so the resolved format can change under a
  // live store, and the key must change with it. An absent format (the
  // engine default) adds nothing.
  const rasterKey = (
    pageObjectNumber: PageObjectNumber,
    width: number,
    annotations: boolean,
    format: RenderFormat | undefined,
    quality: number | undefined,
  ): string =>
    `${pageObjectNumber}|w${width}|a${annotations ? 1 : 0}|e${epochOf(pageObjectNumber, annotations)}` +
    `${format ? `|f${format}` : ''}${quality !== undefined ? `|q${quality}` : ''}`;

  // ── the raster store door (shared by both render doors and the tiles) ──
  function acquireRaster(
    page: PageRef,
    key: string,
    request: {
      viewport: PageRenderViewport;
      includeAnnotations: boolean;
      format: RenderFormat | undefined;
      quality: number | undefined;
    },
    signal: AbortSignal | undefined,
  ): Promise<PageImageHandle> {
    const result = store.acquire(
      key,
      (storeSignal) => {
        const task = ctx.doc.page(page).render.image({
          viewport: request.viewport,
          includeAnnotations: request.includeAnnotations,
          ...(request.format !== undefined ? { format: request.format } : {}),
          ...(request.quality !== undefined ? { quality: request.quality } : {}),
        });
        if (storeSignal.aborted) task.abort(reasonOf(storeSignal));
        else
          storeSignal.addEventListener('abort', () => task.abort(reasonOf(storeSignal)), {
            once: true,
          });
        return task; // AbortablePromise<PageImageHandle> is a Promise<PageImageHandle>
      },
      signal,
    );
    return result.then(
      (image) => {
        renderCompleted.emit({ page, key });
        return image;
      },
      (error: unknown) => {
        const mapped = toPluginError('render', error);
        if (
          !isPluginError(mapped, 'operation-cancelled') &&
          !isPluginError(mapped, 'instance-closed')
        ) {
          renderFailed.emit({ page, key, error: toPluginErrorInfo(mapped) });
        }
        throw mapped;
      },
    );
  }

  /** The host door: conformed to the render points. Async so refusals reject. */
  async function renderSource(
    page: PageRef,
    {
      scale,
      includeAnnotations,
      signal,
    }: { scale: number; includeAnnotations?: boolean; signal?: AbortSignal },
  ): Promise<PageImageHandle> {
    assertCanRender('render.renderSource');
    const annotations = includeAnnotations ?? true;
    const viewport = conformViewport(page, scale);
    const strategy = currentStrategy();
    const key = rasterKey(
      page.pageObjectNumber,
      viewport.kind === 'width' ? viewport.width : 0,
      annotations,
      strategy.format,
      undefined,
    );
    return acquireRaster(
      page,
      key,
      {
        viewport,
        includeAnnotations: annotations,
        format: strategy.format,
        quality: strategy.quality,
      },
      signal,
    );
  }

  /** The public door: the requested size, exactly. Async so refusals reject. */
  async function renderPage(
    page: PageRef,
    options: RenderPageOptions = {},
  ): Promise<PageImageHandle> {
    assertCanRender('render.renderPage');
    const pageWidth = pageWidthOf(page);
    const width = Math.max(1, Math.round(options.width ?? (options.scale ?? 1) * pageWidth));
    const annotations = options.includeAnnotations ?? true;
    const strategy = currentStrategy();
    const format = options.format ?? strategy.format;
    const quality = options.quality ?? strategy.quality;
    // Exact-size renders share the store with the conformed door: a width
    // that matches a conformed raster (same format, default quality) is the
    // same key, so the cached image serves it.
    const key = rasterKey(page.pageObjectNumber, width, annotations, format, options.quality);
    return acquireRaster(
      page,
      key,
      { viewport: { kind: 'width', width }, includeAnnotations: annotations, format, quality },
      options.signal,
    );
  }

  async function renderPages(
    pages: readonly PageRef[],
    options: RenderPagesOptions = {},
  ): Promise<BatchResult<PageRender, PageRef>> {
    assertCanRender('render.renderPages');
    const concurrency = Math.max(1, options.concurrency ?? DEFAULT_BATCH_CONCURRENCY);
    const applied: PageRender[] = [];
    const failed: { ref: PageRef; error: PluginErrorInfo }[] = [];
    const queue = [...pages];
    const worker = async () => {
      for (let page = queue.shift(); page; page = queue.shift()) {
        try {
          applied.push({ page, image: await renderPage(page, options) });
        } catch (error) {
          failed.push({ ref: page, error: toPluginErrorInfo(toPluginError('render', error)) });
        }
      }
    };
    await Promise.all(Array.from({ length: Math.min(concurrency, queue.length) }, worker));
    // Report in input order, whatever the completion order was.
    const inputOrder = new Map(pages.map((page, index) => [page.pageObjectNumber, index] as const));
    const orderOf = (page: PageRef) => inputOrder.get(page.pageObjectNumber) ?? 0;
    applied.sort((left, right) => orderOf(left.page) - orderOf(right.page));
    failed.sort((left, right) => orderOf(left.ref) - orderOf(right.ref));
    return { applied, skipped: [], failed };
  }

  // ── invalidation: the one place the ledger bumps and onInvalidated fires ──
  function publishInvalidation(
    pageObjectNumbers: readonly PageObjectNumber[],
    scope: InvalidateScope,
    origin: ChangeOrigin | null,
  ): void {
    if (pageObjectNumbers.length === 0) return;
    ctx.state.update(invalidatePages, pageObjectNumbers, scope);
    // Every view's plan for these pages points at old-epoch pixels: re-plan
    // now, so `getPlan` reads fresh on the subscribers' next look.
    for (const pageObjectNumber of pageObjectNumbers) replanPage(pageObjectNumber);
    invalidated.emit({
      pages: pageObjectNumbers.map((pageObjectNumber) => toPageRef(pageObjectNumber)),
      scope,
      origin,
    });
  }

  function invalidate({ pages, scope = 'content' }: InvalidateOptions = {}): void {
    publishInvalidation(
      pages?.map((page) => page.pageObjectNumber) ?? allPageObjectNumbers(),
      scope,
      null,
    );
  }

  // ── tiles: one manager, per-view demand handles with pure reads ──
  // Tile resolutions arrive in bursts (a want set landing): coalesce the
  // re-plans per frame, so N arrivals become one re-plan and one wake-up.
  const pendingAdvance = new Set<PageObjectNumber>();
  let advanceScheduled = false;
  const nextFrame: (callback: () => void) => void =
    typeof requestAnimationFrame === 'function'
      ? (callback) => requestAnimationFrame(() => callback())
      : (callback) => void setTimeout(callback, 16);
  const wake = (pageObjectNumber: PageObjectNumber) => {
    pendingAdvance.add(pageObjectNumber);
    if (advanceScheduled) return;
    advanceScheduled = true;
    nextFrame(() => {
      advanceScheduled = false;
      const advanced = [...pendingAdvance];
      pendingAdvance.clear();
      for (const advancedPage of advanced) replanPage(advancedPage);
    });
  };

  const tiles = new TileManager({
    store,
    options: resolved,
    getPolicy: renderPolicy,
    getPageSize: (pageObjectNumber) => ctx.getPage(toPageRef(pageObjectNumber))?.size,
    getEpoch: epochOf,
    fetchTile: (pageObjectNumber, rect: Rect, scale, includeAnnotations, signal) => {
      // The same refusal the engine would send, without the round trip: a
      // denied session's viewport would otherwise be refused once per tile.
      if (!canRender()) return Promise.reject(permissionDenied('render.tile'));
      const page = toPageRef(pageObjectNumber);
      const strategy = currentStrategy();
      const task = ctx.doc.page(page).render.image({
        // The kernel's page space owns the page → PDF conversion (crop offsets included).
        target: { kind: 'rect', rect: ctx.geometry.forPage(page).pageRectToPdf(rect) },
        viewport: { kind: 'scale', scale },
        includeAnnotations,
        ...(strategy.format !== undefined ? { format: strategy.format } : {}),
        ...(strategy.quality !== undefined ? { quality: strategy.quality } : {}),
      });
      if (signal.aborted) task.abort(reasonOf(signal));
      else signal.addEventListener('abort', () => task.abort(reasonOf(signal)), { once: true });
      return task;
    },
    onAdvance: wake,
    ...(resolved.debug ? { debug: (message: string) => console.debug(`[render] ${message}`) } : {}),
  });

  /** One handle per view id, reference-counted; demands and plans per page. */
  const views = new Map<
    string,
    { handle: ViewDemand; refs: number; pages: Map<PageObjectNumber, PageDemand> }
  >();

  /** Re-plan a page for every view that wants it (schedules the next want
   *  set), and wake readers once when any plan changed. */
  function replanPage(pageObjectNumber: PageObjectNumber): void {
    let changed = false;
    for (const [viewId, view] of views) {
      const entry = view.pages.get(pageObjectNumber);
      if (!entry) continue;
      const plan = tiles.plan(viewId, pageObjectNumber, entry.demand, entry.includeAnnotations);
      if (plan !== entry.plan) {
        entry.plan = plan;
        changed = true;
      }
    }
    if (changed) ctx.notify();
  }

  function createViewDemand(viewId: string): ViewDemand {
    const existing = views.get(viewId);
    if (existing) {
      existing.refs += 1;
      return existing.handle;
    }
    const pages = new Map<PageObjectNumber, PageDemand>();
    const handle: ViewDemand = {
      setDemand: (page, demand, options) => {
        const pageObjectNumber = page.pageObjectNumber;
        const includeAnnotations = options?.includeAnnotations ?? true;
        const previous = pages.get(pageObjectNumber);
        const plan = tiles.plan(viewId, pageObjectNumber, demand, includeAnnotations);
        pages.set(pageObjectNumber, { demand, includeAnnotations, plan });
        if (plan !== previous?.plan) ctx.notify();
      },
      getPlan: (page) => pages.get(page.pageObjectNumber)?.plan ?? EMPTY_TILE_PLAN,
      markPainted: (page, key) => tiles.sourcePainted(viewId, page.pageObjectNumber, key),
      markUnpainted: (page, key) => tiles.sourceUnpainted(viewId, page.pageObjectNumber, key),
      release: (page) => {
        pages.delete(page.pageObjectNumber);
        tiles.releasePage(viewId, page.pageObjectNumber);
      },
      dispose: () => {
        const view = views.get(viewId);
        if (!view || view.refs === 0) return;
        view.refs -= 1;
        if (view.refs > 0) return;
        // The last reference releases the view's pages. The entry itself stays
        // (a few ids per document) so a handle that is re-acquired or reused
        // after a dispose (React's development double-mount) keeps working.
        for (const pageObjectNumber of [...view.pages.keys()]) {
          tiles.releasePage(viewId, pageObjectNumber);
        }
        view.pages.clear();
      },
    };
    views.set(viewId, { handle, refs: 1, pages });
    return handle;
  }

  const paintSettings: PaintSettings = Object.freeze({
    fadeMs: resolved.tiles.fadeMs,
    tiles: resolved.tiles.enabled,
  });

  const api: RenderHostCapability = {
    // ── public lens ──
    canRender,
    renderPage,
    renderThumbnail: (page, { maxWidth, includeAnnotations, signal }) =>
      renderPage(page, { width: maxWidth, includeAnnotations, signal }),
    renderPages,
    getRenderPolicy: renderPolicy,
    getRenderEpoch: (page, includeAnnotations = true) =>
      epochOf(page.pageObjectNumber, includeAnnotations),
    invalidate,
    onInvalidated: invalidated.on,

    // ── host lens ──
    renderSource,
    getSourceKey: (page, { scale, includeAnnotations }) => {
      const viewport = conformViewport(page, scale);
      return rasterKey(
        page.pageObjectNumber,
        viewport.kind === 'width' ? viewport.width : 0,
        includeAnnotations ?? true,
        currentStrategy().format,
        undefined,
      );
    },
    conformViewport,
    getPaintSettings: () => paintSettings,
    createViewDemand,
    onRenderCompleted: renderCompleted.on,
    onRenderFailed: renderFailed.on,
  };

  return {
    api,
    connect() {
      // Confirmed pixel-changing facts, own or remote, and the stream
      // notice that some were lost.
      ctx.listen(ctx.doc.events, (event) => {
        const change = pixelChangeOf(event, allPageObjectNumbers);
        if (!change) return;
        publishInvalidation(change.pages, change.scope, 'origin' in event ? originOf(event) : null);
      });
    },
  };
}
