/**
 * @embedpdf/plugin-render/contract — the public render vocabulary.
 *
 * Page rasters for developers: exact-size renders, thumbnails, batches, the
 * deployment's render policy, and invalidation (both directions: the
 * `invalidate` verb in, `onInvalidated` out). Everything a view layer needs
 * to paint (conformed source keys, tile plans) is the host lens,
 * `@embedpdf/plugin-render/contract/host`.
 */
import {
  type BatchResult,
  type DeepPartial,
  type EngineRenderPolicy,
  type EventHook,
  type EventOrigin,
  type OperationOptions,
  type PageImageHandle,
  type PageImageOptions,
  type PageRef,
  type SettingsApi,
} from '@embedpdf/core';
import type { FullPageOptions, PageViewDemand, TilesOptions } from './paint-plan';

export type { FullPageOptions, PageViewDemand, TilesOptions } from './paint-plan';
export { samePageViewDemand } from './paint-plan';

// ── settings ────────────────────────────────────────────────────────────────

/** Encode format the engine can produce for a raster. */
export type RenderFormat = NonNullable<PageImageOptions['format']>;

/**
 * The render strategy: what the viewer chooses to spend, and which render
 * points it uses when the engine permits anything. The shape mirrors the
 * deployment policy (`policy.fullPage` / `policy.tiles`), and the one
 * composition rule is: a strategy value applies as written under a
 * `continuous` policy, and the advertised lattice wins when there is one,
 * so the same settings run unchanged against local and cloud. They belong to
 * the plugin as registered: `updateSettings()` changes every document.
 */
export interface RenderSettings {
  /** Base plane: the pixel budget + render points. */
  readonly fullPage: FullPageOptions;
  /** Tile plane strategy; `false` disables the plane entirely. */
  readonly tiles: TilesOptions | false;
  /**
   * Encode format for both planes. Unset → engine default (png local, the
   * deployment's format on cloud). `'bmp'` is the local fast path — no
   * compression, no encoder-worker round trip; under a lattice it conforms
   * to `policy.formats`.
   */
  readonly format: RenderFormat | undefined;
  /** WebP quality from 0 (smallest) to 1 (best); PNG and BMP ignore it. */
  readonly quality: number | undefined;
  /** Diagnostic logging of tile scheduling and fetch outcomes (console `debug`). */
  readonly debug: boolean;
}

/** What the render settings are when the app registers none. */
export const RENDER_DEFAULTS: RenderSettings = {
  fullPage: { maxWidth: 640, quantize: 'exact' },
  tiles: {
    size: 512,
    quantize: 'exact',
    maxScale: 128,
    bleed: 1,
    prefetch: { margin: 0.5, velocityBias: true },
    settleMs: 150,
    fadeMs: 0,
  },
  format: undefined,
  quality: undefined,
  debug: false,
};

/** What `renderPlugin(config)` takes: any of the settings, merged over the defaults. */
export type RenderConfig = DeepPartial<RenderSettings>;

// ── the raster vocabulary ───────────────────────────────────────────────────

/**
 * An encoded page image: `source` is bytes or a URL, `format`/`contentType`
 * say what they are, `width`/`height` its pixel size, and
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
 *   'annotations' — only baked appearances changed (an annotation mutated, a
 *                   form widget re-baked). Base renders keep their pixels.
 *   'content'     — the page itself changed (redaction applied, text edited).
 *                   Invalidates everything: content strictly contains annotations.
 */
export type InvalidateScope = 'content' | 'annotations';

export interface InvalidateOptions {
  /** The pages whose pixels changed, by ref or index; omitted = every page. */
  pages?: readonly (PageRef | number)[];
  /** Defaults to `'content'` — a caller who doesn't say is safest repainted fully. */
  scope?: InvalidateScope;
}

// ── events ──────────────────────────────────────────────────────────────────

/** Pixels changed on these pages: a confirmed document mutation (own or
 *  remote) or an `invalidate` call. Anything holding a rendered bitmap refetches. */
export interface RenderInvalidatedEvent {
  readonly pages: readonly PageRef[];
  readonly scope: InvalidateScope;
  /**
   * Where the document mutation came from. Null when a caller requested the
   * invalidation through {@link RenderCapability.invalidate}.
   */
  readonly origin: EventOrigin | null;
}

// ── the public capability ───────────────────────────────────────────────────

export interface RenderCapability extends SettingsApi<RenderSettings> {
  /**
   * Would page rasters be served to this session (`doc.render`)? When false
   * every render refuses locally with `permission-denied` — no doomed engine
   * round-trips — and a host can show its "no preview" state instead.
   */
  canRender(): boolean;
  /**
   * Render one page, by its ref or its index, at the requested size. The
   * size is honoured exactly (nothing is snapped to the viewer's render
   * points); the shared raster cache serves the call when it already holds a
   * matching image. Rejects `permission-denied` without `doc.render`,
   * `not-found` for a page that is not in this document,
   * `operation-cancelled` when `signal` fires.
   */
  renderPage(page: PageRef | number, options?: RenderPageOptions): Promise<PageImage>;
  /** Sugar for a small raster at `maxWidth` device pixels. Rejects like `renderPage`. */
  renderThumbnail(page: PageRef | number, options: RenderThumbnailOptions): Promise<PageImage>;
  /**
   * Render several pages with bounded concurrency; best-effort per page: each
   * rendered page with its image, in the order given, and each page that
   * failed (as given) with why. Rejects `permission-denied` without
   * `doc.render`, `operation-cancelled` when `signal` fires.
   */
  renderPages(
    pages: readonly (PageRef | number)[],
    options?: RenderPagesOptions,
  ): Promise<BatchResult<PageRender, PageRef | number>>;
  /** The deployment's advertised render policy (a document fact). */
  getRenderPolicy(): EngineRenderPolicy;
  /**
   * The version of the raster the given options would produce. Key a
   * long-lived render on it: when it bumps, refetch. Base renders version on
   * content facts; annotated renders on content and annotation facts. Bumps
   * only on confirmed mutations — never optimistically. 0 for a page that
   * isn't in the document.
   */
  getRenderEpoch(page: PageRef | number, includeAnnotations?: boolean): number;
  /**
   * Declare that page pixels changed — the open door for facts the built-in
   * event map doesn't know (a plugin's own mutation vocabulary, anything
   * third-party). Call at confirmation, never for optimistic previews.
   * Fires `onInvalidated`; a page that isn't in the document is skipped.
   */
  invalidate(options?: InvalidateOptions): void;
  /** Pages' pixels changed and they will redraw. */
  readonly onInvalidated: EventHook<RenderInvalidatedEvent>;
}

export { RenderToken } from './token';

// Re-exported for hosts that describe what a view wants (`PageContext.getViewDemand`).
export type { PageViewDemand as ViewDemandInput };
