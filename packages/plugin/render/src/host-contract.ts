/**
 * @embedpdf/plugin-render/contract/host — the HOST lens.
 *
 * What view layers need to paint: the conforming render door and its source
 * keys, the resolved paint settings, and a per-view tile surface whose reads
 * are pure. Same runtime token as the public one, typed wider. Never use
 * this from application code.
 */
import type {
  CapabilityToken,
  EventHook,
  OperationOptions,
  PageRef,
  PageRenderViewport,
  PluginErrorInfo,
} from '@embedpdf/core';
import {
  RenderToken as PublicRenderToken,
  type PageImage,
  type RenderCapability,
} from './contract';
import type { PageViewDemand, TilePaintPlan } from './paint-plan';

export * from './contract';
export type { TilePaintPlan, TilePaintSource } from './paint-plan';

/** Layer-facing paint settings (resolved config the view layers need). Reference-stable. */
export interface PaintSettings {
  /** Tile arrival cross-fade (ms); 0 = hard pop. */
  readonly fadeMs: number;
  /** Whether the tile plane is enabled at all (`tiles: false` opts out). */
  readonly tiles: boolean;
}

export interface RenderSourceOptions {
  /** Device px per PDF point (the page transform's `renderScale`). */
  scale: number;
  /** Bake annotations (default true). Pass false when an annotation layer paints them. */
  includeAnnotations?: boolean;
}

/**
 * One view's tile surface. Identity (the view) is bound at creation; every
 * call addresses that view's own state for the given page, so two views
 * showing the same page plan independently — a thumbnail rail's
 * never-engaging demand cannot disturb the main view's tiles.
 *
 * Reads are pure: `setDemand` is the one call that schedules fetches and
 * re-plans; `getPlan` returns the plan that demand produced (memoized — the
 * same object until the demand, an epoch, or a tile arrival changes it, so
 * layers subscribe with plain `Object.is`). Handles are reference-stable per
 * view id and reference-counted: every `createViewDemand` pairs with one
 * `dispose`.
 */
export interface ViewDemand {
  /** What this view wants for a page right now. Idempotent; schedules the want set. */
  setDemand(
    page: PageRef,
    demand: PageViewDemand,
    options?: { includeAnnotations?: boolean },
  ): void;
  /** The current paint plan for a page under this view's demand. Pure. */
  getPlan(page: PageRef): TilePaintPlan;
  /** The image for this plan key had a presentation opportunity. */
  markPainted(page: PageRef, key: string): void;
  /** The inverse report: this plan key's element left the DOM. */
  markUnpainted(page: PageRef, key: string): void;
  /** This view unmounted its tile plane for the page: abort in-flight tile
   *  fetches, drop ITS bookkeeping (resolved bytes stay cached). */
  release(page: PageRef): void;
  /** Release every page of this view and drop the handle's reference. */
  dispose(): void;
}

export interface RenderCompletedEvent {
  readonly page: PageRef;
  readonly key: string;
}

export interface RenderFailedEvent {
  readonly page: PageRef;
  readonly key: string;
  readonly error: PluginErrorInfo;
}

export interface RenderHostCapability extends RenderCapability {
  /**
   * The VIEWER door: render a page at the scale a view shows it, CONFORMED
   * through the resolved render points (STRATEGY ∧ POLICY) — the exact
   * demand capped at the pixel budget under `continuous`, the advertised
   * ladder under a lattice — with same-key asks collapsing in the raster
   * store. Layers key their fetch on {@link getSourceKey}.
   */
  renderSource(page: PageRef, options: RenderSourceOptions & OperationOptions): Promise<PageImage>;
  /**
   * The identity of the raster `renderSource` would produce — conformed
   * width + annotations flag + epoch (+ format), as one stable string.
   * Under a lattice it moves only at rung crossings; under exact-mode
   * `continuous` it tracks the demand and is constant above the budget.
   */
  getSourceKey(page: PageRef, options: RenderSourceOptions): string;
  /** The canonical viewport a desired scale conforms to for this page (always width-kind). */
  conformViewport(page: PageRef, scale: number): PageRenderViewport;
  getPaintSettings(): PaintSettings;
  /** This view's tile surface. Stable per view id; pair with `dispose`. */
  createViewDemand(viewId: string): ViewDemand;
  /** A base raster resolved / failed (the conforming and exact doors alike). */
  readonly onRenderCompleted: EventHook<RenderCompletedEvent>;
  readonly onRenderFailed: EventHook<RenderFailedEvent>;
}

export const RenderToken = PublicRenderToken as unknown as CapabilityToken<RenderHostCapability>;
