import {
  createCapabilityToken,
  type EngineRenderPolicy,
  type PageImageHandle,
  type PageObjectNumber,
  type PageRenderViewport,
} from '@embedpdf/core';

import type { PageViewDemand, TilePaintPlan, TilingConfig } from './paint-plan';

/** Options for `renderPlugin()`. Tiling is capability + economics here;
 *  WHICH view tiles is composition (mount a TileLayer per lens), and
 *  WHETHER it engages is demand arithmetic — three levels, three owners. */
export interface RenderPluginOptions {
  tiling?: TilingConfig;
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
   * CONFORMS to the deployment policy's three-layer rule:
   * under a lattice the desired `scale` converts to the canonical ladder width
   * via `snapFullPageViewport`; under `continuous` it passes through exactly.
   * Same-key requests collapse in the plugin's raster store (singleflight +
   * LRU), so repeated asks inside one rung cost one engine call.
   */
  renderPage(pon: PageObjectNumber, options: RenderPageOptions): Promise<PageImageHandle>;
  /**
   * The identity of the raster `renderPage` would produce for these options —
   * canonical viewport + annotations flag + epoch, as one stable string.
   * Layers key their fetch effect on THIS instead of the raw scale: inside a
   * rung the key never changes (zoom 1.2→1.5 under a [1,2]-ish lattice is a
   * no-op — no refetch, no DOM churn); it changes exactly at rung crossings
   * and epoch bumps. Always available: the kernel materializes the policy on
   * `DocumentMeta` before the document publishes.
   */
  renderSourceKey(
    pon: PageObjectNumber,
    options: { scale: number; includeAnnotations?: boolean },
  ): string;
  /**
   * The canonical viewport a desired scale conforms to for this page —
   * width-kind on a lattice, the exact scale under `continuous`.
   */
  conformViewport(pon: PageObjectNumber, scale: number): PageRenderViewport;
  /** The document's advertised policy (sugar over `DocumentMeta.renderPolicy`). */
  renderPolicy(): EngineRenderPolicy;
  /**
   * The tile paint plan for a page under a host-supplied demand. Tiling is a
   * STRATEGY inside this plugin, not a sibling.
   * Memoized: the same object returns until the demand, an epoch, or a
   * tile resolution actually changes it, so layers can subscribe with
   * plain `Object.is`. Calling it schedules the want-set fetches (visible
   * first, prefetch ring after) — idempotent, store-deduped. Engagement
   * is pure arithmetic: it fires only when the policy's ladder caps the
   * base below the demand; a thumbnail-sized demand never engages.
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
  /** A lens unmounted its TileLayer: abort in-flight tile fetches and drop
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
