import { createCapabilityToken, type PageObjectNumber } from '@embedpdf/core';
import type { Point, Rect, TextQuad } from '@embedpdf/core-geometry';
import type { SelectionSegment } from './geometry';

export type { SelectionSegment } from './geometry';

/** A glyph address: a page + a flat glyph index within that page's geometry. */
export interface GlyphPointer {
  pon: PageObjectNumber;
  glyph: number;
}

/** Anchor = where the drag began, focus = the current end. Inclusive. */
export interface SelectionRange {
  anchor: GlyphPointer;
  focus: GlyphPointer;
}

/**
 * A selection boundary, anchored to the boundary GLYPH's own oriented cell.
 * `advance` is the reading direction of the segment it belongs to (+1 = the
 * frame's +x), so caret consumers place at the trailing edge without
 * re-deriving bidi from geometry. `rect` is the AABB (scroll targets).
 */
export interface SelectionEndpoint {
  pon: PageObjectNumber;
  glyphQuad: TextQuad;
  advance: 1 | -1;
  rect: Rect;
}

export interface SelectionSnapshot {
  /** Per-page canonical segments — the ONE geometry consumers act on.
   *  Boxes are derived views (`segment.rect`, or `rectsForPage()`). */
  pages: Array<{ pon: PageObjectNumber; segments: SelectionSegment[] }>;
  start: SelectionEndpoint | null;
  end: SelectionEndpoint | null;
  direction: 'forward' | 'backward';
}

export interface SelectionState {
  selection: SelectionRange | null;
  /** Derived per-line segments per page, in CONTENT space (y-down, PDF units). */
  segments: Record<number, SelectionSegment[]>;
  /** Pages whose text geometry has loaded (so the layer re-renders when ready). */
  loaded: Record<number, boolean>;
  /** When a consumer owns the selection visual (e.g. a markup tool draws its own
   *  preview), the default highlight rects are suppressed. */
  highlightHidden: boolean;
}

export type SelectionAction =
  | { type: 'PAGE_LOADED'; pon: PageObjectNumber }
  | { type: 'SET'; selection: SelectionRange; segments: Record<number, SelectionSegment[]> }
  | { type: 'CLEAR' }
  | { type: 'SET_HIGHLIGHT_HIDDEN'; hidden: boolean };

export interface SelectionCapability {
  /** Warm a page's text geometry (idempotent). Layers call this when a page mounts. */
  ensurePage(pon: PageObjectNumber): void;
  isLoaded(pon: PageObjectNumber): boolean;
  /** Is a content-space point on (or near) text? Drives the I-beam vs pointer cursor. */
  isOverText(pon: PageObjectNumber, point: Point): boolean;
  /** Begin a caret selection at a page point. Returns false if not near any text. */
  beginAt(pon: PageObjectNumber, point: Point): boolean;
  /** Double-click: select the word around the point. */
  selectWord(pon: PageObjectNumber, point: Point): void;
  /** Triple-click: select the whole visual line around the point. */
  selectLine(pon: PageObjectNumber, point: Point): void;
  /** Extend the current selection to a page point (drag). */
  extendTo(pon: PageObjectNumber, point: Point): void;
  end(): void;
  clear(): void;
  /** Coherent read-model for consumers that create annotations or selection UI. */
  snapshot(): SelectionSnapshot;
  /** Per-line oriented segments for a page, in content space — the layer's input. */
  segmentsForPage(pon: PageObjectNumber): SelectionSegment[];
  /** The segments' AABBs — for consumers that genuinely want boxes (scroll,
   *  conservative regions). Never a substitute for the oriented quads in
   *  geometry that gets drawn or persisted. */
  rectsForPage(pon: PageObjectNumber): Rect[];
  hasSelection(): boolean;
  /** The pages the current selection covers (those with at least one rect) — so a
   *  cross-page action (e.g. text-markup creation) can fan out per page. */
  selectedPages(): PageObjectNumber[];
  /** Fires whenever the selection rects change (e.g. drag-extend) — for live preview. */
  onChange(cb: () => void): () => void;
  /** Fires when a selection gesture ends (pointer-up) — the commit point. */
  onCommit(cb: () => void): () => void;
  /** Suppress / restore the default highlight visual (a consumer drawing its own). */
  setHighlightVisible(visible: boolean): void;
  highlightVisible(): boolean;
}

export const SelectionToken = createCapabilityToken<SelectionCapability>('selection');
