/**
 * @embedpdf/plugin-selection/contract — the public selection vocabulary.
 *
 * Selection ranges live in character space (half-open `TextRange`, the same
 * space search hits address). Geometry needs `doc.text.select`, text
 * extraction needs `doc.text.copy`, and neither permission implies the other.
 * Segments, endpoints and anchors are in page space (page space: y-down,
 * PDF units, crop-relative), the space every layer paints in.
 */
import type {
  DeepPartial,
  EventHook,
  OperationOptions,
  PageRef,
  SettingsApi,
} from '@embedpdf/core';
import type { Point, Rect, Quad } from '@embedpdf/core-geometry';
import type { SelectionSegment } from './geometry';

export type { SelectionSegment } from './geometry';

// ── settings ────────────────────────────────────────────────────────────────

/**
 * The selection plugin's settings. `selectionPlugin(config)` registers them
 * over {@link SELECTION_DEFAULTS}, and `updateSettings()` changes them for
 * every document while the app runs. The colors and the shadow can also come
 * from CSS (`--epdf-text-selection`, `--epdf-text-selection-handle`,
 * `--epdf-text-selection-handle-shadow`), which wins over the setting.
 */
export interface SelectionSettings {
  /** How far, in viewport pixels, the pointer travels before a press becomes a drag that selects. */
  readonly dragThreshold: number;
  /** The color of selected text: a CSS color, or `null` for the viewer's accent at 35%. */
  readonly color: string | null;
  /** The grips at the selection's ends, on touch screens. */
  readonly handles: {
    /** A CSS color, or `null` for the viewer's accent. */
    readonly color: string | null;
    /** A CSS `box-shadow`. */
    readonly shadow: string;
  };
}

/** What the selection settings are when the app registers none. */
export const SELECTION_DEFAULTS: SelectionSettings = {
  dragThreshold: 4,
  color: null,
  handles: { color: null, shadow: '0 1px 4px rgb(0 0 0 / 0.35)' },
};

/** What `selectionPlugin(config)` takes: any of the settings, merged over the defaults. */
export type SelectionConfig = DeepPartial<SelectionSettings>;

// ── the range vocabulary ────────────────────────────────────────────────────

/**
 * A position in a page's character space — the space the engine's geometry
 * runs tile (`PageGeometryRun.charStart`) and search hits address
 * (`SearchMatch.charStart`). Not a string offset into extracted text; the
 * two spaces are joined by the engine's `charMap` (see engine-core
 * `text/charmap.ts`), which `readText()` applies for you.
 */
export interface TextPosition {
  page: PageRef;
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
 * `select({ page: hit.page, start: hit.charStart, count: hit.charCount })`
 * needs no conversion.
 */
export type SelectionRangeInput = TextRange | { page: PageRef; start: number; count: number };

// ── the read model ──────────────────────────────────────────────────────────

/**
 * A selection boundary, anchored to the boundary glyph's own oriented cell.
 * `advance` is the reading direction of the segment it belongs to (+1 = the
 * frame's +x), so caret consumers place at the trailing edge without
 * re-deriving bidi from geometry. `rect` is the AABB (scroll targets).
 */
export interface SelectionEndpoint {
  page: PageRef;
  glyphQuad: Quad;
  advance: 1 | -1;
  rect: Rect;
}

/** Where selection-scoped floating UI attaches: a page + the selection's
 *  union box on it, in page space. See {@link SelectionCapability.getAnchor}. */
export interface SelectionAnchor {
  page: PageRef;
  bounds: Rect;
}

export interface SelectionSnapshot {
  /** Per-page canonical segments — the one geometry consumers act on.
   *  Boxes are derived views (`segment.rect`, or `listRects()`). */
  readonly pages: readonly { page: PageRef; segments: readonly SelectionSegment[] }[];
  readonly start: SelectionEndpoint | null;
  readonly end: SelectionEndpoint | null;
  readonly direction: 'forward' | 'backward';
  /**
   * The selection as a half-open character range in document order — a
   * valid {@link SelectionCapability.select} input (persist and restore).
   * Null when nothing is selected. Until a boundary page's text geometry
   * has loaded, its index may still exceed the page's character count
   * (`selectAll` settles as geometry arrives); consumers of the range
   * (`select`, `readTextInRange`) clamp, so round-tripping is always safe.
   */
  readonly range: TextRange | null;
}

// ── events ──────────────────────────────────────────────────────────────────

/**
 * The selection's range or segments changed: a gesture step, a programmatic
 * select, a boundary page's text geometry arriving, or a clear. Selection is
 * session state, so the event carries no document origin.
 */
export interface SelectionChangedEvent {
  readonly range: TextRange | null;
  /** The pages that carry a segment right now. */
  readonly pages: readonly PageRef[];
}

/** A selection gesture ended (pointer-up, handle release) with a selection in
 *  place — the commit point markup creation and clipboard prefetch act on.
 *  Never fires for programmatic selection. */
export interface SelectionCommittedEvent {
  readonly range: TextRange;
}

/** The selection went from a range to nothing. */
export type SelectionClearedEvent = Record<string, never>;

// ── the public capability ───────────────────────────────────────────────────

/**
 * The public selection API — the documented, stable surface for application
 * code (toolbars, context menus, automation).
 *
 * The permission model: geometry enables selection (`doc.text.select`),
 * text enables extraction (`doc.text.copy`) — neither implies the other.
 * Everything here except the `readText` pair works with the select scope
 * alone, so a deployment can allow selecting and highlighting while denying
 * copy. Writes without the scope throw `PluginError('permission-denied')`;
 * gate UI with {@link canSelect} / {@link canCopy}.
 *
 * Every gesture has a programmatic twin: drag = {@link select} (or
 * `beginGestureAt` + {@link extendTo} for point-driven code on the host
 * lens), double-click = {@link selectWordAt}, triple-click =
 * {@link selectLineAt}, handle drag = {@link extendTo}, click on empty space
 * = {@link clear}, select-all = {@link selectAll}.
 *
 * A page argument is a `PageRef` or a zero-based index. A verb given a page
 * that isn't in the document throws `not-found`; a read returns empty.
 *
 * The settings (`getSettings`, `updateSettings`, `resetSettings`,
 * `onSettingsChanged`) belong to the plugin, not to a document: a change
 * reaches every open document.
 *
 * Framework-only plumbing (gesture bracketing, geometry warming, the
 * highlight-visibility handshake) lives on `SelectionHostCapability`,
 * reachable through `@embedpdf/plugin-selection/contract/host`. Both are the
 * same runtime object — two typed lenses on one token.
 */
export interface SelectionCapability extends SettingsApi<SelectionSettings> {
  // ── authorization (mirrors the engine's own enforcement) ──
  /** Whether this caller may create selections at all (`doc.text.select`). */
  canSelect(): boolean;
  /** Whether this caller may extract literal text (`doc.text.copy`). */
  canCopy(): boolean;

  // ── writes (character space, half-open) ──
  /**
   * Select a range — the same path gestures use, so the highlight, events
   * and markup bridges behave identically. An empty range clears. Throws
   * `permission-denied` without `doc.text.select`, `not-found` for a page
   * that is not in this document. Fires `onChanged`, or `onCleared`.
   */
  select(range: SelectionRangeInput): void;
  /** Select every character of the document. Throws `permission-denied` without `doc.text.select`. */
  selectAll(): void;
  /**
   * Select every character on one page. Throws `permission-denied` without
   * `doc.text.select`, `not-found` for a page that is not in this document.
   */
  selectPage(page: PageRef | number): void;
  /**
   * Select the word around a page point. Returns false when the point has no
   * selectable text (geometry not loaded yet, or no glyph there). Throws
   * `permission-denied` without `doc.text.select`, `not-found` for a page that
   * is not in this document.
   */
  selectWordAt(page: PageRef | number, point: Point): boolean;
  /** Select the visual line around a page point. Same result and errors as {@link selectWordAt}. */
  selectLineAt(page: PageRef | number, point: Point): boolean;
  /**
   * Extend the current selection to a page point (a drag step). No selection
   * → no-op; a page whose geometry has not loaded is warmed and the extension
   * lands when it arrives. Errors as {@link selectPage}.
   */
  extendTo(page: PageRef | number, point: Point): void;
  /** Clear the selection. Always allowed. Fires `onCleared` when something was selected. */
  clear(): void;

  // ── reads ──
  /** Whether anything is selected. */
  hasSelection(): boolean;
  /**
   * Whether the user is still selecting: from the press of a drag, a
   * double-click or a handle until it lifts. A selection made from code is
   * never in progress.
   */
  isSelecting(): boolean;
  /** Per-page segments, endpoints, direction and the range. Reference-stable
   *  until the selection changes. */
  getSnapshot(): SelectionSnapshot;
  /** The selected character range, or null. */
  getRange(): TextRange | null;
  /** The pages the current selection covers (those with at least one
   *  segment), in document order — so a cross-page action can fan out per page. */
  listSelectedPages(): readonly PageRef[];
  /** Per-line oriented segments for a page, in page space — build your own
   *  highlight layer from these. Reference-stable per page. */
  listSegments(page: PageRef | number): readonly SelectionSegment[];
  /** The segments' AABBs — for consumers that genuinely want boxes (scroll,
   *  conservative regions). Never a substitute for the oriented quads in
   *  geometry that gets drawn or persisted. */
  listRects(page: PageRef | number): readonly Rect[];
  /**
   * Where selection-scoped floating UI should attach: the union box of the
   * selection's segments on its end page (where the gesture finished),
   * falling back to the last page with materialized segments while a
   * boundary page's geometry is still loading. One anchor regardless of
   * cross-page selection. Null when nothing is selected (or nothing has
   * materialized yet).
   */
  getAnchor(): SelectionAnchor | null;

  // ── text extraction (requires doc.text.copy) ──
  /**
   * The selected text. Each page's text snapshot is fetched once per content
   * version and sliced through the engine's `charMap`; pages are joined with
   * `\n`. Resolves `''` when nothing is selected. Rejects `permission-denied`
   * without `doc.text.copy`, and `operation-cancelled` when `options.signal`
   * fires. Clipboard writes are deliberately not here — this package is
   * DOM-free; use `@embedpdf/web`'s clipboard helpers.
   */
  readText(options?: OperationOptions): Promise<string>;
  /**
   * Text for any range, without touching the selection. Rejects as
   * {@link readText} does, and `not-found` for a page that is not in this
   * document.
   */
  readTextInRange(range: TextRange, options?: OperationOptions): Promise<string>;

  // ── events ──
  /** The range or its segments changed, whoever changed them. */
  readonly onChanged: EventHook<SelectionChangedEvent>;
  /** A selection gesture ended with a selection in place. */
  readonly onCommitted: EventHook<SelectionCommittedEvent>;
  /** The selection went from a range to nothing: a clear, an empty range, or
   *  its pages' content changed or left the document. */
  readonly onCleared: EventHook<SelectionClearedEvent>;
}

export { SelectionToken } from './token';
