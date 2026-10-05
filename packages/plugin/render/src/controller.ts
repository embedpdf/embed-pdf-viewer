import {
  CONTINUOUS_RENDER_POLICY,
  isPluginError,
  memo,
  toPageRef,
  toPluginError,
  toPluginErrorInfo,
  type BatchResult,
  type EventOrigin,
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
  RenderFormat,
  RenderInvalidatedEvent,
  RenderPageOptions,
  RenderPagesOptions,
  RenderSettings,
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
import { renderPriority, screenFacts, type RenderPurpose, type ScreenFacts } from './priority';
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

/** An engine render still on its way, and what decides its priority. */
interface RankedRender {
  readonly task: { setPriority(priority: number): void };
  readonly page: PageObjectNumber;
  readonly purpose: () => RenderPurpose;
  priority: number;
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
 * One order for every engine render it asks for: a priority from what the
 * views show (`priority.ts`), changed while the render waits when the views
 * move on.
 *
 * The tile manager and the per-view plans live outside state (they hold
 * live handles and abort controllers); a re-plan wakes readers with
 * `ctx.notify()`.
 */
export function createRenderController(ctx: PluginContext<RenderState, RenderSettings>) {
  const settings = ctx.settings();
  // The settings as the strategy reads them, resolved again when they change.
  const resolvedOptions: () => ResolvedRenderOptions = memo(
    () => [settings.get()] as const,
    (current) => resolveRenderOptions(current),
  );
  const store = new RasterStore();
  const invalidated = ctx.events.source<RenderInvalidatedEvent>();
  const renderCompleted = ctx.events.source<RenderCompletedEvent>();
  const renderFailed = ctx.events.source<RenderFailedEvent>();

  const canRender = (): boolean => ctx.allows(RENDER_SCOPE);

  // One-shot developer hints: misconfigurations, not errors.
  let warnedFormat = false;
  const warnDroppedFormat = (strategy: ResolvedStrategy, requested: RenderFormat | undefined) => {
    if (warnedFormat || requested === undefined || strategy.format === requested) return;
    warnedFormat = true;
    console.warn(
      `[render] format '${requested}' is not in the deployment's formats — using '${strategy.format}'.`,
    );
  };
  let warnedBudget = false;
  const warnPastBudgetNoTiles = (demandWidth: number, supplied: number) => {
    if (warnedBudget || resolvedOptions().tiles.enabled || demandWidth <= supplied * 2) return;
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
    () => [renderPolicy(), resolvedOptions()] as const,
    (policy, options) => {
      const strategy = resolveStrategy(policy, options);
      warnDroppedFormat(strategy, options.format);
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
    (ctx.document()?.pages ?? []).map((info) => info.ref.objectNumber);

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

  // ── priority: what the views show orders the renders ──
  /** Handles per view id, reference-counted; demands and plans per page. */
  const views = new Map<
    string,
    { handle: ViewDemand; refs: number; pages: Map<PageObjectNumber, PageDemand> }
  >();
  // The facts of every view's demands, recomputed after one changed.
  let facts: ScreenFacts | null = null;
  const currentFacts = (): ScreenFacts =>
    (facts ??= screenFacts(
      [...views.values()].flatMap((view) =>
        [...view.pages].map(([page, entry]) => ({ page, demand: entry.demand })),
      ),
      (pageObjectNumber) => ctx.getPage(toPageRef(pageObjectNumber))?.size,
    ));
  const ranked = new Set<RankedRender>();

  /** Starts an engine render at its priority now, re-ranked while it waits. */
  function startRanked<T extends PromiseLike<unknown> & { setPriority(priority: number): void }>(
    page: PageObjectNumber,
    purpose: () => RenderPurpose,
    render: (priority: number) => T,
  ): T {
    const priority = renderPriority(purpose(), page, currentFacts());
    const task = render(priority);
    const entry: RankedRender = { task, page, purpose, priority };
    ranked.add(entry);
    const settled = () => void ranked.delete(entry);
    task.then(settled, settled);
    return task;
  }

  // A view's demand changed: the renders on their way take their priority now.
  // Nothing waits for the other views to report first: the engine reads
  // priorities only when it picks its next render, after this burst of reports.
  function demandsChanged(): void {
    facts = null;
    if (ranked.size === 0) return;
    const now = currentFacts();
    for (const render of ranked) {
      const priority = renderPriority(render.purpose(), render.page, now);
      if (priority === render.priority) continue;
      render.priority = priority;
      render.task.setPriority(priority);
    }
  }

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
        const task = startRanked(
          page.objectNumber,
          () => 'base',
          (priority) =>
            ctx.doc.page(page).render.image({
              viewport: request.viewport,
              includeAnnotations: request.includeAnnotations,
              ...(request.format !== undefined ? { format: request.format } : {}),
              ...(request.quality !== undefined ? { quality: request.quality } : {}),
              priority,
            }),
        );
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
    ctx.assertAllowed(RENDER_SCOPE, 'render.renderSource');
    const annotations = includeAnnotations ?? true;
    const viewport = conformViewport(page, scale);
    const strategy = currentStrategy();
    const key = rasterKey(
      page.objectNumber,
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
    pageArgument: PageRef | number,
    options: RenderPageOptions = {},
  ): Promise<PageImageHandle> {
    ctx.assertAllowed(RENDER_SCOPE, 'render.renderPage');
    const { ref: page, size } = ctx.pageOf(pageArgument);
    const width = Math.max(1, Math.round(options.width ?? (options.scale ?? 1) * size.width));
    const annotations = options.includeAnnotations ?? true;
    const strategy = currentStrategy();
    const format = options.format ?? strategy.format;
    const quality = options.quality ?? strategy.quality;
    // Exact-size renders share the store with the conformed door: a width
    // that matches a conformed raster (same format, default quality) is the
    // same key, so the cached image serves it.
    const key = rasterKey(page.objectNumber, width, annotations, format, options.quality);
    return ctx.cancellable(
      options.signal,
      acquireRaster(
        page,
        key,
        { viewport: { kind: 'width', width }, includeAnnotations: annotations, format, quality },
        options.signal,
      ),
    );
  }

  async function renderPages(
    pages: readonly (PageRef | number)[],
    options: RenderPagesOptions = {},
  ): Promise<BatchResult<PageRender, PageRef | number>> {
    ctx.assertAllowed(RENDER_SCOPE, 'render.renderPages');
    const concurrency = Math.max(1, options.concurrency ?? DEFAULT_BATCH_CONCURRENCY);
    // Each entry keeps its place in the input, so the result reads in the
    // order given whatever order the renders finished in.
    const applied: { index: number; render: PageRender }[] = [];
    const failed: { index: number; ref: PageRef | number; error: PluginErrorInfo }[] = [];
    const queue = pages.map((page, index) => ({ page, index }));
    const worker = async () => {
      for (let next = queue.shift(); next; next = queue.shift()) {
        const { page, index } = next;
        try {
          const image = await renderPage(page, options);
          applied.push({ index, render: { page: ctx.pageOf(page).ref, image } });
        } catch (error) {
          failed.push({
            index,
            ref: page,
            error: toPluginErrorInfo(toPluginError('render', error)),
          });
        }
      }
    };
    const batch = Promise.all(Array.from({ length: Math.min(concurrency, queue.length) }, worker));
    await ctx.cancellable(options.signal, batch);
    const byInput = (left: { index: number }, right: { index: number }) => left.index - right.index;
    return {
      applied: applied.sort(byInput).map(({ render }) => render),
      skipped: [],
      failed: failed.sort(byInput).map(({ ref, error }) => ({ ref, error })),
    };
  }

  // ── invalidation: the one place the ledger bumps and onInvalidated fires ──
  function publishInvalidation(
    pageObjectNumbers: readonly PageObjectNumber[],
    scope: InvalidateScope,
    origin: EventOrigin | null,
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
    const named = pages?.flatMap((page) => ctx.getPage(page)?.ref.objectNumber ?? []);
    publishInvalidation(named ?? allPageObjectNumbers(), scope, null);
  }

  // ── tiles: one manager, per-view demand handles with pure reads ──
  // Tile resolutions arrive in bursts (a want set landing): coalesce the
  // re-plans per frame, so N arrivals become one re-plan and one wake-up.
  const pendingAdvance = new Set<PageObjectNumber>();
  let advanceScheduled = false;
  const wake = (pageObjectNumber: PageObjectNumber) => {
    pendingAdvance.add(pageObjectNumber);
    if (advanceScheduled) return;
    advanceScheduled = true;
    ctx.clock.nextFrame(() => {
      advanceScheduled = false;
      const advanced = [...pendingAdvance];
      pendingAdvance.clear();
      for (const advancedPage of advanced) replanPage(advancedPage);
    });
  };

  const tiles = new TileManager({
    store,
    getOptions: resolvedOptions,
    getPolicy: renderPolicy,
    getPageSize: (pageObjectNumber) => ctx.getPage(toPageRef(pageObjectNumber))?.size,
    getEpoch: epochOf,
    after: ctx.clock.after,
    priorityOf: (pageObjectNumber, prefetch) =>
      renderPriority(prefetch ? 'prefetch' : 'tile', pageObjectNumber, currentFacts()),
    fetchTile: async (
      pageObjectNumber,
      rect: Rect,
      scale,
      includeAnnotations,
      signal,
      prefetch,
    ) => {
      // The same refusal the engine would send, without the round trip: a
      // denied session's viewport would otherwise be refused once per tile.
      ctx.assertAllowed(RENDER_SCOPE, 'render.tile');
      const page = toPageRef(pageObjectNumber);
      const strategy = currentStrategy();
      const task = startRanked(
        pageObjectNumber,
        () => (prefetch() ? 'prefetch' : 'tile'),
        (priority) =>
          ctx.doc.page(page).render.image({
            target: { kind: 'rect', rect },
            viewport: { kind: 'scale', scale },
            includeAnnotations,
            ...(strategy.format !== undefined ? { format: strategy.format } : {}),
            ...(strategy.quality !== undefined ? { quality: strategy.quality } : {}),
            priority,
          }),
      );
      if (signal.aborted) task.abort(reasonOf(signal));
      else signal.addEventListener('abort', () => task.abort(reasonOf(signal)), { once: true });
      return task;
    },
    onAdvance: wake,
    debug: (message: string) => {
      if (resolvedOptions().debug) console.debug(`[render] ${message}`);
    },
  });

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
        const pageObjectNumber = page.objectNumber;
        const includeAnnotations = options?.includeAnnotations ?? true;
        const previous = pages.get(pageObjectNumber)?.plan;
        // The demand first: the plan starts tiles in the order it sets.
        const entry: PageDemand = { demand, includeAnnotations, plan: previous ?? EMPTY_TILE_PLAN };
        pages.set(pageObjectNumber, entry);
        demandsChanged();
        entry.plan = tiles.plan(viewId, pageObjectNumber, demand, includeAnnotations);
        if (entry.plan !== previous) ctx.notify();
      },
      getPlan: (page) => pages.get(page.objectNumber)?.plan ?? EMPTY_TILE_PLAN,
      markPainted: (page, key) => tiles.sourcePainted(viewId, page.objectNumber, key),
      markUnpainted: (page, key) => tiles.sourceUnpainted(viewId, page.objectNumber, key),
      release: (page) => {
        pages.delete(page.objectNumber);
        demandsChanged();
        tiles.releasePage(viewId, page.objectNumber);
      },
      dispose: () => {
        const view = views.get(viewId);
        if (!view || view.refs === 0) return;
        view.refs -= 1;
        if (view.refs > 0) return;
        // The last reference releases the view's pages. The entry itself stays
        // (a few ids per document) so a handle that is re-acquired or reused
        // after a dispose (React's development double-mount) keeps working.
        const shown = [...view.pages.keys()];
        view.pages.clear();
        demandsChanged();
        for (const pageObjectNumber of shown) tiles.releasePage(viewId, pageObjectNumber);
      },
    };
    views.set(viewId, { handle, refs: 1, pages });
    return handle;
  }

  // What the layers paint with: the same object until a setting it reads changes.
  const paintSettings = memo(
    () => [resolvedOptions().tiles.fadeMs, resolvedOptions().tiles.enabled] as const,
    (fadeMs, enabled): PaintSettings => Object.freeze({ fadeMs, tiles: enabled }),
  );

  // A settings change reaches every view's plans at once: re-plan what they show.
  ctx.listen(settings.api.onSettingsChanged, () => {
    const shown = new Set<PageObjectNumber>();
    for (const view of views.values()) for (const page of view.pages.keys()) shown.add(page);
    for (const page of shown) replanPage(page);
  });

  const api: RenderHostCapability = {
    // ── public lens ──
    ...settings.api,
    canRender,
    renderPage,
    renderThumbnail: (page, { maxWidth, includeAnnotations, signal }) =>
      renderPage(page, { width: maxWidth, includeAnnotations, signal }),
    renderPages,
    getRenderPolicy: renderPolicy,
    getRenderEpoch: (page, includeAnnotations = true) => {
      const info = ctx.getPage(page);
      return info ? epochOf(info.ref.objectNumber, includeAnnotations) : 0;
    },
    invalidate,
    onInvalidated: invalidated.on,

    // ── host lens ──
    renderSource,
    getSourceKey: (page, { scale, includeAnnotations }) => {
      const viewport = conformViewport(page, scale);
      return rasterKey(
        page.objectNumber,
        viewport.kind === 'width' ? viewport.width : 0,
        includeAnnotations ?? true,
        currentStrategy().format,
        undefined,
      );
    },
    conformViewport,
    getPaintSettings: paintSettings,
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
        publishInvalidation(change.pages, change.scope, 'origin' in event ? event.origin : null);
      });
    },
  };
}
