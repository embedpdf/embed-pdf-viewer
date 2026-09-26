/**
 * @embedpdf/plugin-selection/contract/host — the HOST lens.
 *
 * What render layers, the interaction hub and sibling plugins need on top
 * of the public contract: gesture bracketing, geometry warming and the
 * highlight-visibility handshake. Same runtime token as the public one,
 * typed wider. Never use this from application code.
 */
import type { CapabilityToken, PageRef } from '@embedpdf/core';
import type { Point } from '@embedpdf/core-geometry';
import { SelectionToken as PublicSelectionToken, type SelectionCapability } from './contract';

export * from './contract';

export interface SelectionHostCapability extends SelectionCapability {
  /** Warm a page's text geometry. Resolves once loaded; resolves immediately
   *  (nothing requested) without `doc.text.select` or for an unknown page. A
   *  failed read resolves too — the layer simply has nothing to paint. */
  ensureLoaded(page: PageRef): Promise<void>;
  isLoaded(page: PageRef): boolean;
  /** Is a page-space point on (or near) text? Drives the I-beam cursor. */
  isOverText(page: PageRef, point: Point): boolean;
  /**
   * A pointer gesture that drives the selection opened (pointer-down). From
   * here until {@link endGesture}, changes carry a `user` origin and
   * selection-scoped UI hides. Programmatic writes never open a gesture.
   */
  beginGesture(): void;
  /** Open a caret selection at a page point (the first drag step). Returns
   *  false when the point has no text — the caller lets the gesture go. */
  beginGestureAt(page: PageRef, point: Point): boolean;
  /** The gesture ended (pointer-up). Settles first, then emits `onCommitted`
   *  when a selection is in place. */
  endGesture(): void;
  /** Whether a selection gesture is in flight. A readable FACT: derived
   *  recomputes never touch it, programmatic selections are born settled. */
  isGestureActive(): boolean;
  /** Suppress / restore the default highlight visual (a consumer drawing its
   *  own preview — the markup ghost). */
  setHighlightVisible(visible: boolean): void;
  isHighlightVisible(): boolean;
}

export const SelectionToken =
  PublicSelectionToken as unknown as CapabilityToken<SelectionHostCapability>;
