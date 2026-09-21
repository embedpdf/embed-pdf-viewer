import {
  CONTINUOUS_RENDER_POLICY,
  PluginError,
  isPluginError,
  originOf,
  toPageRef,
  toPluginError,
  toPluginErrorInfo,
  type BatchResult,
  type ChangeOrigin,
  type ControllerContext,
  type DocCapability,
  type DocumentEvent,
  type EngineRenderPolicy,
  type PageImageHandle,
  type PageObjectNumber,
  type PageRef,
  type PageRenderViewport,
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
import { annotatedPons } from './invalidation';
import type { RenderAction, RenderState } from './model';
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
/** Engine events carry an origin except the stream's own housekeeping. */
const originOfEvent = (event: DocumentEvent): ChangeOrigin =>
  'origin' in event && event.origin ? originOf(event) : SYSTEM_ORIGIN;
const DEFAULT_BATCH_CONCURRENCY = 4;
const SYSTEM_ORIGIN: ChangeOrigin = {
  locality: 'local',
  trigger: 'system',
  sessionId: null,
  actorId: null,
};
const API_ORIGIN: ChangeOrigin = { ...SYSTEM_ORIGIN, trigger: 'api' };

/** A view's live demand for one page, as last set through its handle. */
interface PageDemand {
  demand: PageViewDemand;
  includeAnnotations: boolean;
  plan: TilePaintPlan;
}

/**
 * The render controller: the ONE place STRATEGY (config — what the viewer
 * spends) composes with POLICY (the engine fact — what the deployment
 * serves). The engine never snaps; layers never see either; everything
 * between — conforming demand to the resolved render points, collapsing
 * same-key asks in the raster store, exposing stable source keys, turning a
 * view's demand into a retention-safe tile plan — happens here.
 *
 * Two doors for rasters: `renderPage` (public, exact size) and
 * `renderSource` (host, conformed). Both share the raster store, so a
 * developer's thumbnail and the rail's base plane never render twice.
 *
 * Two doors for staleness: confirmed document events (see `connect`) and
 * the `invalidate` verb. Both go through `publishInvalidation`, the one
 * place the ledger bumps and `onInvalidated` fires.
 */
export function createRenderController(
  ctx: ControllerContext<RenderState, RenderAction>,
  config: RenderConfig = {},
) {
  const resolved: ResolvedRenderOptions = resolveRenderOptions(config);
  const store = new RasterStore();
  const invalidated = ctx.events.source<RenderInvalidatedEvent>();
  const renderCompleted = ctx.events.source<RenderCompletedEvent>();
  const renderFailed = ctx.events.source<RenderFailedEvent>();

  const canRender = (): boolean => ctx.doc.security.allows(RENDER_SCOPE);
  const assertCanRender = (operation: string): void => {
    if (!canRender()) {
      throw new PluginError(
        'permission-denied',
        'render',
        `${operation} requires ${RENDER_SCOPE}`,
        {
          details: { required: RENDER_SCOPE },
        },
      );
    }
  };

  // ── strategy ∧ policy ──
  // The policy is a DOCUMENT FACT on the kernel's registry — materialized
  // before publish. Composed with the strategy once per policy reference.
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

  // ── pages ──
  const pageWidthOf = (page: PageRef): number => {
    const info = ctx.getPage(page);
    if (!info) ctx.assertPageRef(page); // throws not-found
    return info!.size.width;
  };
  const allPons = (): PageObjectNumber[] =>
    (ctx.document()?.pages ?? []).map((p) => p.ref.pageObjectNumber);

  // The ONE base-sizing path — renderSource, getSourceKey, conformViewport,
  // and (via the tile manager) engagement all go through baseAskWidth.
  const conformViewport = (page: PageRef, scale: number): PageRenderViewport => {
    const demandWidth = scale * pageWidthOf(page);
    const width = baseAskWidth(strategy(), demandWidth);
    warnPastBudgetNoTiles(demandWidth, width);
    return { kind: 'width', width };
  };

  const epochOf = (pon: PageObjectNumber, includeAnnotations: boolean): number => {
    const s = ctx.getState();
    const content = s.contentEpochs[pon] ?? 0;
    return includeAnnotations ? content + (s.annotatedEpochs[pon] ?? 0) : content;
  };

  // A raster's identity includes its encode format: the cloud policy arrives
  // async after open, so the resolved format can change under a live store —
  // the key must change with it. Absent format (engine default) adds nothing.
  const rasterKey = (
    pon: PageObjectNumber,
    width: number,
    annotations: boolean,
    format: RenderFormat | undefined,
    quality: number | undefined,
  ): string =>
    `${pon}|w${width}|a${annotations ? 1 : 0}|e${epochOf(pon, annotations)}` +
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

  /** The HOST door: conformed to the render points. Async so refusals reject. */
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
    const s = strategy();
    const key = rasterKey(
      page.pageObjectNumber,
      viewport.kind === 'width' ? viewport.width : 0,
      annotations,
      s.format,
      undefined,
    );
    return acquireRaster(
      page,
      key,
      { viewport, includeAnnotations: annotations, format: s.format, quality: s.quality },
      signal,
    );
  }

  /** The PUBLIC door: the requested size, exactly. Async so refusals reject. */
  async function renderPage(
    page: PageRef,
    options: RenderPageOptions = {},
  ): Promise<PageImageHandle> {
    assertCanRender('render.renderPage');
    const pageWidth = pageWidthOf(page);
    const width = Math.max(1, Math.round(options.width ?? (options.scale ?? 1) * pageWidth));
    const annotations = options.includeAnnotations ?? true;
    const s = strategy();
    const format = options.format ?? s.format;
    const quality = options.quality ?? s.quality;
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
    const failed: { ref: PageRef; error: ReturnType<typeof toPluginErrorInfo> }[] = [];
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
    const index = new Map(pages.map((p, i) => [p.pageObjectNumber, i] as const));
    const at = (p: PageRef) => index.get(p.pageObjectNumber) ?? 0;
    applied.sort((a, b) => at(a.page) - at(b.page));
    failed.sort((a, b) => at(a.ref) - at(b.ref));
    return { applied, skipped: [], failed };
  }

  // ── invalidation: the one place the ledger bumps and onInvalidated fires ──
  function publishInvalidation(
    pons: readonly PageObjectNumber[],
    scope: InvalidateScope,
    origin: ChangeOrigin,
  ): void {
    if (pons.length === 0) return;
    ctx.dispatch({ type: 'invalidate', scope, pages: pons });
    // Every view's plan for these pages points at old-epoch pixels — re-plan
    // now, so `getPlan` reads fresh after the subscribers' next look.
    for (const pon of pons) replanPage(pon);
    invalidated.emit({ pages: pons.map((pon) => toPageRef(pon)), scope, origin });
  }

  function invalidate({ pages, scope = 'content' }: InvalidateOptions = {}): void {
    publishInvalidation(pages?.map((p) => p.pageObjectNumber) ?? allPons(), scope, API_ORIGIN);
  }

  // ── tiles: one manager, per-view demand handles with pure reads ──
  // Tile resolutions arrive in bursts (a want set landing) — coalesce the
  // re-plans per frame so N arrivals become one plan bump, one commit.
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
      for (const pon of pons) replanPage(pon);
    });
  };

  const tiles = new TileManager({
    store,
    options: resolved,
    getPolicy: policy,
    getPageSize: (pon) => ctx.getPage(toPageRef(pon))?.size,
    getEpoch: epochOf,
    fetchTile: (pon, rect: Rect, scale, includeAnnotations, signal) => {
      // Same refusal the engine would send, without the round trip — a denied
      // session's viewport would otherwise 403 once per tile, forever.
      if (!canRender()) {
        return Promise.reject(
          new PluginError('permission-denied', 'render', `render.tile requires ${RENDER_SCOPE}`, {
            details: { required: RENDER_SCOPE },
          }),
        );
      }
      const page = toPageRef(pon);
      const s = strategy();
      const task = ctx.doc.page(page).render.image({
        // The kernel's page space owns the page → PDF conversion (crop offsets included).
        target: { kind: 'rect', rect: ctx.geometry.forPage(page).pageRectToPdf(rect) },
        viewport: { kind: 'scale', scale },
        includeAnnotations,
        ...(s.format !== undefined ? { format: s.format } : {}),
        ...(s.quality !== undefined ? { quality: s.quality } : {}),
      });
      if (signal.aborted) task.abort(reasonOf(signal));
      else signal.addEventListener('abort', () => task.abort(reasonOf(signal)), { once: true });
      return task;
    },
    onAdvance: wake,
    ...(resolved.debug ? { debug: (msg: string) => console.debug(`[render] ${msg}`) } : {}),
  });

  /** One handle per view id, reference-counted; demands and plans per page. */
  const views = new Map<
    string,
    { handle: ViewDemand; refs: number; pages: Map<PageObjectNumber, PageDemand> }
  >();

  /** Re-plan a page for every view that wants it (schedules the next want set),
   *  and wake subscribers once when any plan changed. */
  function replanPage(pon: PageObjectNumber): void {
    let changed = false;
    for (const [viewId, view] of views) {
      const entry = view.pages.get(pon);
      if (!entry) continue;
      const plan = tiles.plan(viewId, pon, entry.demand, entry.includeAnnotations);
      if (plan !== entry.plan) {
        entry.plan = plan;
        changed = true;
      }
    }
    if (changed) ctx.dispatch({ type: 'paintAdvanced', page: pon });
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
        const pon = page.pageObjectNumber;
        const includeAnnotations = options?.includeAnnotations ?? true;
        const previous = pages.get(pon);
        const plan = tiles.plan(viewId, pon, demand, includeAnnotations);
        pages.set(pon, { demand, includeAnnotations, plan });
        if (plan !== previous?.plan) ctx.dispatch({ type: 'paintAdvanced', page: pon });
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
        // after a dispose — React's development double-mount — keeps working.
        for (const pon of [...view.pages.keys()]) tiles.releasePage(viewId, pon);
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
    getRenderPolicy: policy,
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
        strategy().format,
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
      // Confirmed pixel-changing facts, own or remote. Content-scope facts
      // (a redaction apply destroys page content) bump base AND annotated
      // readers; everything else the map knows is appearance-scoped.
      ctx.listen(ctx.doc.events, (event) => {
        if (event.type === 'redaction.applied') {
          const pons = event.results
            .filter((r) => r.status === 'applied')
            .map((r) => r.page.pageObjectNumber);
          publishInvalidation(pons, 'content', originOfEvent(event));
          return;
        }
        publishInvalidation(annotatedPons(event, allPons), 'annotations', originOfEvent(event));
      });
    },
  };
}
