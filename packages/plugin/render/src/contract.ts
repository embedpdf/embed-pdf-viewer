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
  type ResourceStatus,
  type SettingsApi,
} from '@embedpdf/core';
import type { PageTransform } from '@embedpdf/core-geometry';
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
  /**
   * How long a page waits for its first picture before its state turns `slow`, in milliseconds:
   * the moment to show a loading indicator ({@link PictureState}). `0` turns it on at once.
   */
  readonly slowAfterMs: number;
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
  },
  format: undefined,
  quality: undefined,
  slowAfterMs: 400,
  debug: false,
};

/** What `renderPlugin(config)` takes: any of the settings, merged over the defaults. */
export type RenderConfig = DeepPartial<RenderSettings>;

// ── the raster vocabulary ───────────────────────────────────────────────────

/**
 * What a picture draws beside the page content. An option left out draws
 * what the user may read: the annotations with `doc.annotate.read`, the form
 * fields with `doc.forms.read`, and no form fields when `includeAnnotations`
 * is `false`. `true` for something the user may not read is refused
 * (`permission-denied`). Leave out what you paint yourself: a layer that
 * paints annotations passes `includeAnnotations: false`, which leaves the
 * form fields out too unless you ask for them (`includeFormFields: true`).
 */
export interface PageLayerOptions {
  /** Draw the annotations (form fields' widgets excepted). */
  includeAnnotations?: boolean;
  /** Draw the form fields, each in the state its field shows. */
  includeFormFields?: boolean;
}

/**
 * An encoded page image: `source` is bytes or a URL, `format`/`contentType`
 * say what they are, `width`/`height` its pixel size, and
 * `objectUrl()` mints a revocable object URL for an `<img>`.
 */
export type PageImage = PageImageHandle;

export interface RenderPageOptions extends OperationOptions, PageLayerOptions {
  /** Exact output width in device pixels (height keeps the page's aspect). */
  width?: number;
  /** Device pixels per PDF point; ignored when `width` is given. Default 1. */
  scale?: number;
  /** Per-call encode overrides; default to the plugin's strategy. */
  format?: RenderFormat;
  quality?: number;
}

export interface RenderThumbnailOptions extends OperationOptions, PageLayerOptions {
  /** Per-call encode overrides; default to the plugin's strategy. */
  format?: RenderFormat;
  quality?: number;
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
 * The invalidation scopes — every pixel-changing fact is one of them:
 *
 *   'annotations' — an annotation changed. Pictures without annotations keep
 *                   their pixels.
 *   'fields'      — a form field changed: a fill, a widget's place or look,
 *                   a signing. Pictures without form fields keep their pixels.
 *   'content'     — the page itself changed (redaction applied, flattened).
 *                   Invalidates every picture of the page.
 */
export type InvalidateScope = 'content' | 'annotations' | 'fields';

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

// ── whether a page's picture is on screen ───────────────────────────────────

/**
 * Whether a picture of a page is on screen in a view ({@link RenderCapability.getPictureState}).
 * Only the first picture counts: tiles arriving as the view zooms in, and a redraw after a
 * change, keep the old picture on screen, so the page stays `ready`.
 */
export interface PictureState {
  /**
   * `idle`: the view doesn't show the page. `loading`: it does, and no picture of the page is on
   * screen yet. `ready`: one is. `forbidden`: the user may not see it (no `doc.render`).
   * `error`: it couldn't be drawn.
   */
  readonly status: ResourceStatus;
  /** Loading for longer than `slowAfterMs`: the moment to show an indicator. */
  readonly slow: boolean;
}

/** A page's picture came on screen, failed, went slow, or the page left the view. */
export interface PictureStateChangedEvent extends PictureState {
  readonly page: PageRef;
  readonly view: string;
}

/**
 * What paints a page's picture tells the render plugin, so the page's {@link PictureState}
 * knows: the page layers say it for the plugin's own pictures, a {@link PicturePainter} for its.
 */
export interface PictureReport {
  /** A picture of the page is on screen now: it has been presented. */
  shown(): void;
  /**
   * The picture can't be painted, and why: a `permission-denied` error makes the page
   * `forbidden`, any other `error`. Ignored once a picture showed, which stays on screen.
   */
  failed(error: unknown): void;
}

// ── another plugin painting the pictures ────────────────────────────────────

/**
 * The page a painter paints, as every framework's page layer knows it: a
 * subset of `@embedpdf/web`'s page context, the same in each framework.
 */
export interface PicturePage {
  /** The page's address, the same for as long as the page is shown. */
  readonly ref: PageRef;
  /** Its place in the document, from 0. */
  readonly pageIndex: number;
  /** The view that shows it: a Stage's lens id. */
  readonly view: string;
  /** Its size, zoom and turn on screen, and its device pixels. */
  readonly transform: PageTransform;
  /** The part of it on screen, read when asked; absent for a view without a camera. */
  readonly getViewDemand?: () => PageViewDemand;
}

/** A picture a painter is painting: follow the page as it changes, and stop. */
export interface PaintedPicture {
  /** The page's geometry changed (a zoom, a turn, a resize): `page` is how it is now. */
  update(page: PicturePage): void;
  /** The page left its view, or the painter was given back: take the picture away. */
  destroy(): void;
}

/**
 * Something that paints the pages' pictures instead of the render plugin
 * ({@link RenderCapability.handOverPictures}). `Host` is the box a page layer
 * lends it: an `HTMLElement` on the web.
 */
export interface PicturePainter<Host = unknown> {
  /** Whether it paints the pictures of this view; a view it doesn't paint keeps the render plugin's. */
  paints(view: string): boolean;
  /**
   * Paint `page`'s picture into `host`, an empty box over the page's content, until `destroy()`.
   * The page is `loading` until `report.shown()`: call it once the first picture is on screen.
   */
  paint(host: Host, page: PicturePage, report: PictureReport): PaintedPicture;
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
   * May this session have the pages' thumbnails (`doc.render.thumbnail`,
   * which `doc.render` includes)? A session that may not render pages may
   * still have them.
   */
  canRenderThumbnail(): boolean;
  /**
   * Render one page, by its ref or its index, at the requested size. The
   * size is honoured exactly (nothing is snapped to the viewer's render
   * points); the shared raster cache serves the call when it already holds a
   * matching image. Rejects `permission-denied` without `doc.render`,
   * `not-found` for a page that is not in this document,
   * `operation-cancelled` when `signal` fires.
   */
  renderPage(page: PageRef | number, options?: RenderPageOptions): Promise<PageImage>;
  /**
   * The page's thumbnail: the whole page, `PAGE_THUMBNAIL_SIZE` (512) pixels
   * on its long side, sharing the raster cache. Needs only
   * `doc.render.thumbnail`; rejects `permission-denied` without it, otherwise
   * like `renderPage`.
   */
  renderThumbnail(page: PageRef | number, options?: RenderThumbnailOptions): Promise<PageImage>;
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
   * The version of the picture the given options would produce. Key a
   * long-lived render on it: when it bumps, refetch. A picture versions on
   * content facts, plus annotation facts when it draws annotations and form
   * facts when it draws form fields. Bumps only on confirmed mutations —
   * never optimistically. 0 for a page that isn't in the document.
   */
  getRenderEpoch(page: PageRef | number, layers?: PageLayerOptions): number;
  /**
   * Declare that page pixels changed — the open door for facts the built-in
   * event map doesn't know (a plugin's own mutation vocabulary, anything
   * third-party). Call at confirmation, never for optimistic previews.
   * Fires `onInvalidated`; a page that isn't in the document is skipped.
   */
  invalidate(options?: InvalidateOptions): void;
  /** Pages' pixels changed and they will redraw. */
  readonly onInvalidated: EventHook<RenderInvalidatedEvent>;
  /**
   * Whether a picture of the page is on screen in `view` (a page context's `view`): `loading`
   * until one is, and `slow` once it waited `slowAfterMs`. The same object while it's the same;
   * `idle` for a page that isn't in the document.
   */
  getPictureState(page: PageRef | number, view: string): PictureState;
  /** A page's {@link PictureState} changed in a view. */
  readonly onPictureStateChanged: EventHook<PictureStateChangedEvent>;
  /**
   * Let another plugin paint the pages' pictures until the returned function
   * is called, or the document closes. While it holds them, every page layer
   * in a view it paints lends it its box instead of drawing: no picture, no
   * tiles, no renders. One painter at a time: a second is refused
   * (`conflict`) until the first is given back. Take them over in a plugin's
   * `connect()`, and no page shows this plugin's picture first.
   */
  handOverPictures<Host>(painter: PicturePainter<Host>): () => void;
  /** The plugin painting the pictures now, or `null` while this one does. */
  getPicturePainter(): PicturePainter | null;
}

export { RenderToken } from './token';

// Re-exported for hosts that describe what a view wants (`PageContext.getViewDemand`).
export type { PageViewDemand as ViewDemandInput };
