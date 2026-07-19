import { createCapabilityToken, type PageImageHandle, type PageObjectNumber } from '@embedpdf/core';

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
}

export type RenderAction = {
  type: 'INVALIDATE';
  scope: InvalidateScope;
  pons: readonly PageObjectNumber[];
};

export interface RenderCapability {
  /**
   * Render a page (by its durable pon) to an ENCODED image. Abortable. Encoded
   * output is identical for local & cloud and cheap over the wire (vs. raw RGBA).
   */
  renderPage(pon: PageObjectNumber, options: RenderPageOptions): Promise<PageImageHandle>;
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
