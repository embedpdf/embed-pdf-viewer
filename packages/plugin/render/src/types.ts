import {
  createCapabilityToken,
  type EngineRenderPolicy,
  type PageImageHandle,
  type PageImageOptions,
  type PageObjectNumber,
  type PageRenderViewport,
} from '@embedpdf/core';

import type { FullPageOptions, PageViewDemand, TilePaintPlan, TilesOptions } from './paint-plan';

/**
 * Options for `renderPlugin()` — the render STRATEGY: what the viewer
 * chooses to spend, and which render points it uses when the engine permits
 * anything. The shape mirrors the deployment policy (`policy.fullPage` /
 * `policy.tiles`), and the one composition rule is: a strategy value
 * applies as written under a `continuous` policy, and the advertised
 * lattice wins when there is one — so the same options run unchanged
 * against local and cloud.
 */
export interface RenderPluginOptions {
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
  format?: NonNullable<PageImageOptions['format']>;
  /** Encoder quality (webp/png); ignored for bmp. */
  quality?: number;
  /**
   * Diagnostic logging: tile scheduling, settle timing, fetch outcomes —
   * the counters that catch convergence issues in long sessions. Console
   * `debug` level; off by default.
   */
  debug?: boolean;
}

/** Layer-facing paint settings (resolved options the view layers need). */
export interface PaintSettings {
  /** Settle gate both planes use before adopting a new demand (ms). */
  settleMs: number;
  /** Tile arrival cross-fade (ms); 0 = hard pop. */
  fadeMs: number;
  /** Whether the tile plane is enabled at all (`tiles: false` opts out). */
  tiles: boolean;
}

export interface RenderPageOptions {
  /** Device px per PDF point (use the page transform's `renderScale`). */
  scale: number;
  /**
   * Bake annotations into the page bitmap. Default true. Pass false when an
   * <AnnotationLayer> owns annotation rendering, so they aren't painted twice
   * (once baked, once by the overlay).
   */
  includeAnnotations?: boolean;
  /** Abort the render (camera moved / layer unmounted). */
  signal?: AbortSignal;
}

/**
 * The two invalidation scopes — every pixel-changing fact is one of them:
 *
 *   'annotations' — only baked APPEARANCES changed (an annotation mutated, a
 *                   form widget re-baked). Base renders keep their pixels.
 *   'content'     — the PAGE ITSELF changed (redaction applied, text edited).
 *                   Invalidates everything: no mutation can change base pixels
 *                   yet leave an annotated raster valid, so content strictly
 *                   contains annotations.
 */
export type InvalidateScope = 'content' | 'annotations';

/**
 * Per-page versions of the two raster products a page has — base
 * (`includeAnnotations: false`) and annotated. Fed by the document event
 * stream (see effects.ts) and by the `invalidate` verb: a confirmed
 * pixel-changing fact — own or remote — bumps the touched pages, and anything
 * holding a rendered bitmap (a thumbnail rail) refetches.
 */
export interface RenderState {
  /** Base-raster versions — bumped by CONTENT facts (redaction, text edit). */
  readonly contentEpochs: Readonly<Record<PageObjectNumber, number>>;
  /** Appearance versions — bumped by ANNOTATION facts (annotations, form widgets). */
  readonly annotatedEpochs: Readonly<Record<PageObjectNumber, number>>;
  /**
   * Tile paint-plan wake-ups. The tile manager's state (fetch/painted/
   * retention) lives OUTSIDE the store — it holds live handles and abort
   * controllers — so resolutions bump this counter to make subscribed
   * layers recompute `tilePlan`. The value itself carries no meaning.
   */
  readonly paintVersions: Readonly<Record<PageObjectNumber, number>>;
}

export type RenderAction =
  | {
      type: 'INVALIDATE';
      scope: InvalidateScope;
      pons: readonly PageObjectNumber[];
    }
  | { type: 'PAINT_ADVANCED'; pon: PageObjectNumber };

export interface RenderCapability {
  /**
   * Render a page (by its durable pon) to an ENCODED image. Abortable. Encoded
   * output is identical for local & cloud and cheap over the wire (vs. raw RGBA).
   *
   * This is the VIEWER door: the desired `scale` conforms through the
   * resolved render points (STRATEGY ∧ POLICY) — the exact demand capped at
   * the pixel budget under `continuous`, the advertised ladder under a
   * lattice — and same-key requests collapse in the plugin's raster store
   * (singleflight + LRU). Scale-precise offline output (export, print)
   * belongs on the engine door: `doc.page(pon).render.image(...)`.
   */
  renderPage(pon: PageObjectNumber, options: RenderPageOptions): Promise<PageImageHandle>;
  /**
   * The identity of the raster `renderPage` would produce for these options —
   * conformed width + annotations flag + epoch, as one stable string. Layers
   * key their fetch effect on THIS instead of the raw scale. Under a lattice
   * it moves only at rung crossings; under exact-mode `continuous` it tracks
   * the demand, is constant above the budget (always the budget width), and
   * the LAYER settle-gates adoption so it never refetches mid-gesture.
   * Always available: the kernel materializes the policy on `DocumentMeta`
   * before the document publishes.
   */
  renderSourceKey(
    pon: PageObjectNumber,
    options: { scale: number; includeAnnotations?: boolean },
  ): string;
  /**
   * The canonical viewport a desired scale conforms to for this page —
   * always width-kind: the exact demand capped at the budget (exact mode)
   * or the snapped rung (ladder/lattice mode).
   */
  conformViewport(pon: PageObjectNumber, scale: number): PageRenderViewport;
  /** Resolved layer-facing paint settings (settle, fade, tiles on/off). */
  paintSettings(): PaintSettings;
  /** The document's advertised policy (sugar over `DocumentMeta.renderPolicy`). */
  renderPolicy(): EngineRenderPolicy;
  /**
   * The tile paint plan for a page under a host-supplied demand. Tiling is a
   * STRATEGY inside this plugin, not a sibling.
   * Memoized: the same object returns until the demand, an epoch, or a
   * tile resolution actually changes it, so layers can subscribe with
   * plain `Object.is`. Calling it schedules the want-set fetches (visible
   * first, center-out, prefetch ring after) — idempotent, store-deduped.
   * Engagement is pure arithmetic against what the base will ACTUALLY
   * supply (the same `baseAsk` the base layer sizes with): tiles fire when
   * demand exceeds the budget/ladder cap × engageAt — on every engine.
   * A thumbnail-sized demand never engages.
   */
  tilePlan(
    pon: PageObjectNumber,
    demand: PageViewDemand,
    opts?: { includeAnnotations?: boolean },
  ): TilePaintPlan;
  /**
   * The painter's decode-boundary report: the `<img>` for this plan key
   * actually painted (onload). Retained coarser generations covered by
   * painted want-set tiles release on this signal — never on fetch
   * completion, which would flash during decode.
   */
  tilePainted(pon: PageObjectNumber, key: string): void;
  /**
   * The inverse report: this plan key's <img> left the DOM, so its pixels
   * are no longer compositable. Painted is a statement about the SCREEN and
   * must follow the DOM — a remounting tile re-decodes, and until it
   * reports painted again, retention may not count it as coverage.
   */
  tileUnpainted(pon: PageObjectNumber, key: string): void;
  /** A lens unmounted its tile plane: abort in-flight tile fetches and drop
   *  the page's tile bookkeeping (resolved bytes stay cached). */
  releaseTiles(pon: PageObjectNumber): void;
  /**
   * Version of the raster the given options would produce. Key a long-lived
   * render on it: when it bumps, refetch. Base renders version on content
   * facts; annotated renders on content AND annotation facts. Bumps only on
   * CONFIRMED mutations — never optimistically — so a drag invalidates once,
   * at commit.
   */
  renderEpoch(pon: PageObjectNumber, includeAnnotations?: boolean): number;
  /**
   * Declare that page pixels changed — the open door for facts the built-in
   * event map doesn't know (a plugin's own mutation vocabulary: redaction,
   * text edit, anything third-party). Call at CONFIRMATION (after the engine
   * write resolves), never for optimistic previews — those belong in overlay
   * layers. `pons` omitted = every page; `scope` defaults to 'content'
   * (repaint everything) because a caller who doesn't say is safest repainted
   * fully. Redundant with a mapped engine event? Harmless — one extra refetch.
   */
  invalidate(opts?: { pons?: readonly PageObjectNumber[]; scope?: InvalidateScope }): void;
}

export const RenderToken = createCapabilityToken<RenderCapability>('render');
