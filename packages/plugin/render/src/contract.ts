/**
 * @embedpdf/plugin-render/contract — the PUBLIC render vocabulary.
 *
 * Page rasters for developers: exact-size renders, thumbnails, batches, the
 * deployment's render policy, and invalidation (both directions: the
 * `invalidate` verb in, `onInvalidated` out). Everything a view layer needs
 * to paint (conformed source keys, tile plans) is the host lens,
 * `@embedpdf/plugin-render/contract/host`.
 */
import {
  type BatchResult,
  type ChangeOrigin,
  type EngineRenderPolicy,
  type EventHook,
  type OperationOptions,
  type PageImageHandle,
  type PageImageOptions,
  type PageRef,
} from '@embedpdf/core';
import type { FullPageOptions, PageViewDemand, TilesOptions } from './paint-plan';

export type { FullPageOptions, PageViewDemand, TilesOptions } from './paint-plan';

// ── configuration ───────────────────────────────────────────────────────────

/** Encode format the engine can produce for a raster. */
export type RenderFormat = NonNullable<PageImageOptions['format']>;

/**
 * `renderPlugin(config)` — the render STRATEGY: what the viewer chooses to
 * spend, and which render points it uses when the engine permits anything.
 * The shape mirrors the deployment policy (`policy.fullPage` / `policy.tiles`),
 * and the one composition rule is: a strategy value applies as written under
 * a `continuous` policy, and the advertised lattice wins when there is one —
 * so the same config runs unchanged against local and cloud.
 */
export interface RenderConfig {
  /** Base plane: the pixel budget + render points. */
  fullPage?: FullPageOptions;
  /** Tile plane strategy; `false` disables the plane entirely. */
  tiles?: TilesOptions | false;
  /**
   * Encode format for BOTH planes. Unset → engine default (png local, the
   * deployment's format on cloud). `'bmp'` is the local fast path — no
   * compression, no encoder-worker round trip; under a lattice it conforms
   * to `policy.formats`.
   */
  format?: RenderFormat;
  /** Encoder quality (webp/png); ignored for bmp. */
  quality?: number;
  /** Diagnostic logging of tile scheduling and fetch outcomes (console `debug`). */
  debug?: boolean;
}

// ── the raster vocabulary ───────────────────────────────────────────────────

/**
 * An encoded page image: `source` is bytes or a URL, `format`/`contentType`
 * say what they are, `width`/`height` the pixel size when known, and
 * `objectUrl()` mints a revocable object URL for an `<img>`.
 */
export type PageImage = PageImageHandle;

export interface RenderPageOptions extends OperationOptions {
  /** Exact output width in device pixels (height keeps the page's aspect). */
  width?: number;
  /** Device pixels per PDF point; ignored when `width` is given. Default 1. */
  scale?: number;
  /** Bake annotations into the bitmap (default true). */
  includeAnnotations?: boolean;
  /** Per-call encode overrides; default to the plugin's strategy. */
  format?: RenderFormat;
  quality?: number;
}

export interface RenderThumbnailOptions extends OperationOptions {
  /** The thumbnail's width in device pixels. */
  maxWidth: number;
  /** Bake annotations (default true). */
  includeAnnotations?: boolean;
}

export interface RenderPagesOptions extends RenderPageOptions {
  /** Renders in flight at once (default 4). */
  concurrency?: number;
}

/** One entry of a batch render. */
export interface PageRender {
  readonly page: PageRef;
  readonly image: PageImage;
}

/**
 * The two invalidation scopes — every pixel-changing fact is one of them:
 *
 *   'annotations' — only baked APPEARANCES changed (an annotation mutated, a
 *                   form widget re-baked). Base renders keep their pixels.
 *   'content'     — the PAGE ITSELF changed (redaction applied, text edited).
 *                   Invalidates everything: content strictly contains annotations.
 */
export type InvalidateScope = 'content' | 'annotations';

export interface InvalidateOptions {
  /** The pages whose pixels changed; omitted = every page. */
  pages?: readonly PageRef[];
  /** Defaults to `'content'` — a caller who doesn't say is safest repainted fully. */
  scope?: InvalidateScope;
}

// ── events ──────────────────────────────────────────────────────────────────

/** Pixels changed on these pages: a confirmed document mutation (own or
 *  remote) or an `invalidate` call. Anything holding a rendered bitmap refetches. */
export interface RenderInvalidatedEvent {
  readonly pages: readonly PageRef[];
  readonly scope: InvalidateScope;
  readonly origin: ChangeOrigin;
}

// ── the PUBLIC capability ───────────────────────────────────────────────────

export interface RenderCapability {
  /**
   * Would page rasters be served to this session (`doc.render`)? When false
   * every render refuses locally with `permission-denied` — no doomed engine
   * round-trips — and a host can show its "no preview" state instead.
   */
  canRender(): boolean;
  /**
   * Render one page at the requested size. The size is honoured exactly
   * (nothing is snapped to the viewer's render points); the shared raster
   * cache serves the call when it already holds a matching image. Rejects
   * `permission-denied` without `doc.render`, `not-found` for a page that
   * is not in this document, `operation-cancelled` on abort.
   */
  renderPage(page: PageRef, options?: RenderPageOptions): Promise<PageImage>;
  /** Sugar for a small raster at `maxWidth` device pixels. */
  renderThumbnail(page: PageRef, options: RenderThumbnailOptions): Promise<PageImage>;
  /** Render several pages with bounded concurrency; best-effort per page. */
  renderPages(
    pages: readonly PageRef[],
    options?: RenderPagesOptions,
  ): Promise<BatchResult<PageRender, PageRef>>;
  /** The deployment's advertised render policy (a document fact). */
  getRenderPolicy(): EngineRenderPolicy;
  /**
   * The version of the raster the given options would produce. Key a
   * long-lived render on it: when it bumps, refetch. Base renders version on
   * content facts; annotated renders on content AND annotation facts. Bumps
   * only on CONFIRMED mutations — never optimistically.
   */
  getRenderEpoch(page: PageRef, includeAnnotations?: boolean): number;
  /**
   * Declare that page pixels changed — the open door for facts the built-in
   * event map doesn't know (a plugin's own mutation vocabulary, anything
   * third-party). Call at CONFIRMATION, never for optimistic previews.
   */
  invalidate(options?: InvalidateOptions): void;
  readonly onInvalidated: EventHook<RenderInvalidatedEvent>;
}

export { RenderToken } from './token';

// Re-exported for hosts that describe what a view wants (`PageContext.getViewDemand`).
export type { PageViewDemand as ViewDemandInput };
