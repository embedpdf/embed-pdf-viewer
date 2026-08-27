import { createCapabilityToken, type PageObjectNumber } from '@embedpdf/core';
import type { Point, Rect, TextQuad } from '@embedpdf/core-geometry';
import type { SelectionSegment } from './geometry';

export type { SelectionSegment } from './geometry';

// ── the public range vocabulary ─────────────────────────────────────────────

/**
 * A position in a page's CHARACTER space — the space the engine's geometry
 * runs tile (`PageGeometryRun.charStart`) and search hits address
 * (`SearchMatch.charStart`). NOT a string offset into extracted text; the
 * two spaces are joined by the engine's `charMap` (see engine-core
 * `text/charmap.ts`), which `readText()` applies for you.
 */
export interface TextPosition {
  pon: PageObjectNumber;
  /** Character index, 0-based. */
  index: number;
}

/**
 * A half-open range in character space: `start` inclusive, `end` exclusive,
 * in document order (`start` at or before `end`). `end.index` may be 0 to
 * end a range exactly at a page boundary.
 */
export interface TextRange {
  start: TextPosition;
  end: TextPosition;
}

/**
 * What {@link SelectionCapability.select} accepts: a cross-page
 * {@link TextRange}, or a single-page span — the shape of a search hit, so
 * `select({ pon: hit.pageObjectNumber, start: hit.charStart, count: hit.charCount })`
 * needs no conversion.
 */
export type SelectionRangeInput =
  | TextRange
  | { pon: PageObjectNumber; start: number; count: number };

// ── gesture-state vocabulary (host/internal) ────────────────────────────────

/** A glyph address: a page + a flat character index within that page. */
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

/** The selection's floating-UI anchor: a page + the selection's union box on
 *  it, in CONTENT space. See {@link SelectionCapability.menuAnchor}. */
export interface SelectionMenuAnchor {
  pon: PageObjectNumber;
  bounds: Rect;
}

export interface SelectionSnapshot {
  /** Per-page canonical segments — the ONE geometry consumers act on.
   *  Boxes are derived views (`segment.rect`, or `rectsForPage()`). */
  pages: Array<{ pon: PageObjectNumber; segments: SelectionSegment[] }>;
  start: SelectionEndpoint | null;
  end: SelectionEndpoint | null;
  direction: 'forward' | 'backward';
  /**
   * The selection as a half-open character range in document order — a
   * valid {@link SelectionCapability.select} input (persist and restore).
   * Null when nothing is selected. Until a boundary page's text geometry
   * has loaded, its index may still exceed the page's character count
   * (`selectAll` settles as geometry arrives); consumers of the range
   * (`select`, `readText`) clamp, so round-tripping is always safe.
   */
  range: TextRange | null;
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
  /** A selection GESTURE is in flight (drag / double- / triple-click, between
   *  pointer-down and pointer-up). A readable FACT, not an event: derived
   *  recomputes (page load, rotate, move) never touch it, and programmatic
   *  selections are born settled. Consumers apply policy (e.g. a menu hides
   *  while true). */
  selecting: boolean;
}

export type SelectionAction =
  | { type: 'PAGE_LOADED'; pon: PageObjectNumber }
  | { type: 'SET'; selection: SelectionRange; segments: Record<number, SelectionSegment[]> }
  | { type: 'CLEAR' }
  | { type: 'SET_HIGHLIGHT_HIDDEN'; hidden: boolean }
  | { type: 'SET_SELECTING'; selecting: boolean };

// ── the PUBLIC capability ───────────────────────────────────────────────────

/**
 * The PUBLIC selection API — the documented, stable surface for application
 * code (toolbars, context menus, automation). Resolve it with the token
 * re-exported from the package root (`@embedpdf/plugin-selection`).
 *
 * The permission model: GEOMETRY enables selection (`doc.text.select`),
 * TEXT enables extraction (`doc.text.copy`) — neither implies the other.
 * Everything here except `readText()` works with the select scope alone, so
 * a deployment can allow selecting and highlighting while denying copy.
 *
 * Framework-only plumbing (pointer-gesture intents, geometry warming, the
 * highlight-visibility handshake) lives on {@link SelectionHostCapability},
 * reachable only through `@embedpdf/plugin-selection/internal`. Both are
 * the SAME runtime object — two typed lenses on one token.
 */
export interface SelectionCapability {
  // ── authorization (mirrors the engine's own enforcement) ──
  /** Whether this caller may create selections at all (`doc.text.select`).
   *  Authorization only — not "is something selected" ({@link hasSelection})
   *  and not geometry readiness (a host concern). */
  canSelect(): boolean;
  /** Whether this caller may extract literal text (`doc.text.copy`) —
   *  gates {@link readText} and any copy UI. */
  canCopy(): boolean;

  // ── programmatic selection (character space, half-open) ──
  /**
   * Select a range programmatically — the same path gestures use, so the
   * highlight, `onChange`, and markup bridges all behave identically. An
   * empty range clears. Throws the engine's `PermissionDenied` when
   * `doc.text.select` is not granted (gate UI with {@link canSelect}).
   */
  select(range: SelectionRangeInput): void;
  /** Select every character of the document. Same gating as {@link select}. */
  selectAll(): void;
  /** Clear the selection. Always allowed. */
  clear(): void;

  // ── reads ──
  /** Coherent read-model: per-page segments, endpoints, direction, and the
   *  half-open {@link TextRange} (a valid {@link select} input). */
  snapshot(): SelectionSnapshot;
  /**
   * Whether a selection GESTURE is in flight (drag, double- or triple-click
   * — between pointer-down and pointer-up). Programmatic {@link select} /
   * {@link selectAll} never set it (a programmatic selection is born
   * settled), and derived recomputes (page geometry loading, rotate, move)
   * never touch it. THE fact selection-scoped UI applies policy to — e.g.
   * `<SelectionMenu>` hides while true and appears at pointer-up.
   */
  isSelecting(): boolean;
  /**
   * Where selection-scoped floating UI should attach: the union box of the
   * selection's segments on its END page (where the gesture finished),
   * falling back to the last page with materialized segments while a
   * boundary page's geometry is still loading. One anchor regardless of
   * cross-page selection — the shape every anchored-overlay consumer
   * positions on. Null when nothing is selected (or nothing has
   * materialized yet).
   */
  menuAnchor(): SelectionMenuAnchor | null;
  hasSelection(): boolean;
  /** The pages the current selection covers (those with at least one
   *  segment) — so a cross-page action (e.g. markup creation) can fan out
   *  per page. */
  selectedPages(): PageObjectNumber[];
  /** Per-line oriented segments for a page, in content space — build your
   *  own highlight layer from these. */
  segmentsForPage(pon: PageObjectNumber): SelectionSegment[];
  /** The segments' AABBs — for consumers that genuinely want boxes (scroll,
   *  conservative regions). Never a substitute for the oriented quads in
   *  geometry that gets drawn or persisted. */
  rectsForPage(pon: PageObjectNumber): Rect[];

  // ── text extraction (requires doc.text.copy) ──
  /**
   * The selected text. Fetches each selected page's text snapshot (cached
   * per page, immutable per content version) and slices it by the
   * selection's character range through the engine's `charMap` — at most
   * one text read per page per content version, amortized across every
   * call. Pages are joined with `\n`. Resolves `''` when nothing is
   * selected; rejects with `PermissionDenied` when `doc.text.copy` is not
   * granted. Clipboard writes are deliberately NOT here — this package is
   * DOM-free; use `@embedpdf/web`'s clipboard helpers (or your platform's)
   * on top of this.
   */
  readText(): Promise<string>;

  // ── signals ──
  /** Fires whenever the selection segments change (drag-extend, programmatic
   *  select, recompute) — for live preview. Returns an unsubscriber. */
  onChange(cb: () => void): () => void;
  /** Fires when a selection gesture ends (pointer-up) — the commit point
   *  consumers (markup creation, copy prefetch) act on. */
  onCommit(cb: () => void): () => void;
}

// ── the HOST capability ─────────────────────────────────────────────────────

/**
 * The HOST (framework) surface: what render layers, the interaction hub,
 * and sibling plugins need on top of the public lens. Import the token from
 * `@embedpdf/plugin-selection/internal`, never from application code. All
 * point-based functions are gesture vocabulary (`…At` = point-addressed);
 * the programmatic equivalent is the public range-based {@link
 * SelectionCapability.select}. Every function here is INERT (no requests,
 * no state) when `canSelect()` is false — the pointer handler needs no
 * permission special-casing.
 */
export interface SelectionHostCapability extends SelectionCapability {
  /** Warm a page's text geometry (idempotent; no-op without
   *  `doc.text.select`). Layers call this when a page mounts. */
  ensurePage(pon: PageObjectNumber): void;
  isLoaded(pon: PageObjectNumber): boolean;
  /** Is a content-space point on (or near) text? Drives the I-beam cursor. */
  isOverText(pon: PageObjectNumber, point: Point): boolean;
  /** Begin a caret selection at a page point. Returns false if not near any
   *  text — the caller deselects instead of capturing. */
  beginAt(pon: PageObjectNumber, point: Point): boolean;
  /** Double-click / touch long-press: select the word around the point.
   *  Returns false when the point has no selectable text (geometry not
   *  loaded, or no glyph there) — nothing was selected. */
  selectWordAt(pon: PageObjectNumber, point: Point): boolean;
  /** Triple-click: select the whole visual line around the point. Same
   *  success contract as {@link selectWordAt}. */
  selectLineAt(pon: PageObjectNumber, point: Point): boolean;
  /** Extend the current selection to a page point (drag). */
  extendTo(pon: PageObjectNumber, point: Point): void;
  /** The gesture ended (pointer-up) → notify `onCommit` consumers. */
  end(): void;
  /** Suppress / restore the default highlight visual (a consumer drawing its
   *  own preview — the markup ghost). */
  setHighlightVisible(visible: boolean): void;
  highlightVisible(): boolean;
}

/**
 * The selection capability token. Typed to the full
 * {@link SelectionHostCapability} for this module and `/internal`; the
 * package root re-exports the SAME token narrowed to
 * {@link SelectionCapability}.
 */
export const SelectionToken = createCapabilityToken<SelectionHostCapability>('selection');
