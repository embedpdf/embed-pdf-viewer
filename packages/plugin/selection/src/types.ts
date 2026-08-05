import { createCapabilityToken, type PageObjectNumber } from '@embedpdf/core';
import type { Point, Rect } from '@embedpdf/core-geometry';

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

export interface SelectionEndpoint {
  pon: PageObjectNumber;
  rect: Rect;
}

export interface SelectionSnapshot {
  pages: Array<{ pon: PageObjectNumber; rects: Rect[] }>;
  start: SelectionEndpoint | null;
  end: SelectionEndpoint | null;
  direction: 'forward' | 'backward';
}

export interface SelectionState {
  selection: SelectionRange | null;
  /** Derived highlight rects per page, in CONTENT space (y-down, PDF units). */
  rects: Record<number, Rect[]>;
  /** Pages whose text geometry has loaded (so the layer re-renders when ready). */
  loaded: Record<number, boolean>;
  /** When a consumer owns the selection visual (e.g. a markup tool draws its own
   *  preview), the default highlight rects are suppressed. */
  highlightHidden: boolean;
}

export type SelectionAction =
  | { type: 'PAGE_LOADED'; pon: PageObjectNumber }
  | { type: 'SET'; selection: SelectionRange; rects: Record<number, Rect[]> }
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
  /** Highlight rects for a page, in content space — the layer's only input. */
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
