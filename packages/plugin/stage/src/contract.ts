/** @embedpdf/plugin-stage/contract: the public stage vocabulary: settings,
 *  the camera and view model, navigation and reveal options, events, and the
 *  capability. Surface bindings and sibling plugins use the host lens. */
import type { CapabilityToken, EventHook, PageInfo, PageRef } from '@embedpdf/core';
import type { PageRotation, PageTransform, Rect } from '@embedpdf/core-geometry';
import type {
  Alignment,
  AlignmentValue,
  AlignValue,
  Anchor,
  Direction,
  Camera,
  PageBox,
  PageFrame,
  Point,
  ScrollMetrics,
  Size,
  SizingMode,
  SpreadMode,
  ZoomModeValue,
  ZoomSpec,
} from '@embedpdf/core-stage';

export { StageToken } from './token';
export { ZoomMode } from '@embedpdf/core-stage';
export type {
  Align,
  Alignment,
  AlignmentValue,
  AlignValue,
  Camera,
  Size,
  Point,
  Direction,
  PageFrame,
  ScrollMetrics,
  SpreadMode,
  SizingMode,
  ZoomModeValue,
  ZoomSpec,
} from '@embedpdf/core-stage';

export type LayoutKind = 'vertical' | 'horizontal' | 'grid';
/** Navigation (goToPage) either tweens the camera or jumps instantly. */
export type ScrollBehaviorKind = 'smooth' | 'instant';
/**
 * Presentation flow:
 *   'continuous' — the whole document is scrollable; the camera roams the full scene.
 *   'paged'      — one item (page or spread) at a time: the scene is a one-item
 *                  slice at the cursor, and nextPage/previousPage step between items.
 */
export type FlowMode = 'continuous' | 'paged';
/**
 * Grid column policy:
 *   'square' — ≈√n columns (the classic canvas arrangement)
 *   'auto'   — wrapped: as many columns as fit the viewport line at the current
 *              zoom (the responsive thumbnail-sidebar behavior; re-wraps on resize)
 *   number   — a fixed column count
 */
export type GridColumns = 'square' | 'auto' | number;

/**
 * Space between items — the value's shape carries the unit (like ZoomSpec):
 *   number     — world units: the gap is part of the canvas and scales with zoom,
 *                so the whole scene zooms as one rigid object (the document feel).
 *   { px: n }  — screen px: UI-stable spacing, the same in every document at every
 *                zoom (the browser-of-items feel: thumbnails, organizers).
 */
export type Gap = number | { px: number };

/**
 * The one environmental fact a headless stage has: the box it was told about
 * (`setViewportSize`). Responsive rules can query nothing else — no user agent, no
 * pointer type (modality is per-event, on `PointerSample`), no window. Space,
 * not device: a narrow pane on a desktop is compact too, and each stage
 * instance resolves against its own box.
 */
export interface StageBox {
  width: number;
  height: number;
  /** Of the container, not the device. A square box is 'portrait' (the CSS rule). */
  orientation: 'portrait' | 'landscape';
}

/** Declarative box query: all bounds inclusive, all fields optional, every condition must hold. */
export interface BoxQuery {
  minWidth?: number;
  maxWidth?: number;
  minHeight?: number;
  maxHeight?: number;
  orientation?: 'portrait' | 'landscape';
}

/**
 * One `@container` block for the settings bag: when the box matches, assert
 * this settings patch. Rules evaluate in source order and all matching rules
 * apply, later winning per key (each key replaced whole — no deep merges).
 * Effective settings = base (config + runtime setters) ⊕ matching patches.
 *
 * Semantics:
 *   • Runtime setters write the base; a matching rule wins over it. Apps
 *     needing situational absolute control edit the rules (`setResponsiveRules`).
 *   • Rules assert at transitions (box/base/rules changes), not continuously —
 *     between crossings, interaction owns the state. A rule containing `zoom`
 *     re-fits when the box crosses it (the rotate-an-iPad behavior) and then
 *     leaves the pinch alone.
 *
 * A rule with a `name` is a queryable fact (`matchesRule(name)`), reactive in
 * every framework; a named rule with no settings is a pure shared breakpoint
 * the app chrome can key its own presentation off — one definition serving
 * both the layout math and the UI.
 */
export interface ResponsiveRule {
  name?: string;
  /** Declarative box query, or a predicate for anything the box can answer. */
  when: BoxQuery | ((box: StageBox) => boolean);
  /** The settings this situation asserts. Omit for a pure named query. */
  settings?: Partial<StageSettings>;
}

/**
 * One axis of the arrival policy — stage-core's AlignValue ('start' |
 * 'center' | 'end' | viewport fraction 0–1) plus one navigation-only word:
 *   'keep' — this axis does not move on arrival: page forward, hold your
 *            pan (the two-column-paper feel; the PDF /XYZ null semantic).
 */
export type ArrivalAlignValue = AlignValue | 'keep';
export interface ArrivalAlignment {
  x: ArrivalAlignValue;
  y: ArrivalAlignValue;
}

/**
 * The stage's orthogonal, independently settable primitives. Every field can be
 * set on its own (setLayout, setFlow, …) or several at once through
 * `updateSettings()`. A preset is a `Partial<StageSettings>` the app keeps and
 * applies; no preset machinery lives here.
 */
export interface StageSettings {
  /** Continuous scroll, or one item at a time. */
  flow: FlowMode;
  layout: LayoutKind;
  spread: SpreadMode;
  /** Page sizing: true PDF sizes, or equalize the cross axis so pages sit flush. */
  sizing: SizingMode;
  /** Grid column policy (grid layout only): 'square', 'auto' (wrapped), or a count. */
  columns: GridColumns;
  /** Clamp the camera to the content? Off = free infinite pan (construction drawings). */
  bounded: boolean;
  /**
   * Breathing room (screen px) around the content — the one spacing concept.
   * Fit-modes inset by it, arrivals leave it as a gutter, and the clamp lets the
   * camera reveal exactly this much beyond each content edge.
   */
  padding: number;
  /**
   * Space between items — and between the halves of a spread. A number is world
   * units (scales with zoom — the canvas feel); `{ px }` is screen px (UI-stable
   * — the thumbnail feel). See {@link Gap}.
   */
  gap: Gap;
  /**
   * Reserved chrome real estate around each page, in screen px — one thickness
   * per side. The page content is inset by these; the bands hold box-space
   * chrome (a label below, a button row above, side rails) painted by the app
   * via the adapter's `pageChrome` slot. Per page, not per item: in a spread
   * every page keeps its own flanks. Constant screen px (unaffected by zoom).
   *
   * Naming rule for this settings bag: every setting describes the stage itself
   * (the container) — `padding`, `gap`, `layout`, … The rare setting owned by the
   * page carries the `page` prefix (`pageFrame`; `pageWidth` in zoom).
   */
  pageFrame: PageFrame;
  /**
   * Reading direction. RTL: horizontal items advance leftward, spreads bind on the
   * right, grid rows fill right→left, and alignment 'start' on x means the right
   * edge (logical, CSS-style). Navigation is index-based and never changes.
   */
  direction: Direction;
  /**
   * The alignment family — every camera move is defined by what it holds
   * fixed. Gestures (pan/pinch/wheel) hold the pointer: physics, no setting.
   * Explicit arrivals (positioned reveal, destinations, viewpoints) hold
   * whatever the call specifies. These four settings govern the rest:
   *
   *   fitAlign     — the standing constraint: where content rests on an axis
   *                  the camera cannot travel (it fits the true bounds — the
   *                  scene in continuous flow, the item slice in paged). The
   *                  clamp enforces it on every camera write — which is why a
   *                  fitting axis settles identically whatever arrivalAlign
   *                  says. center/center = document feel; y:'start' = sidebar
   *                  thumbnails hugging the top.
   *   arrivalAlign — the landing policy: where navigation (goToPage,
   *                  nextPage, previousPage, resetView) puts the target — the
   *                  same at every zoom.
   *                  start/start = reading (top-left, direction-aware);
   *                  center/center = presentation/drawings (Drawboard feel);
   *                  y: 0.35 = the find-bar line; 'keep' = don't move an axis.
   *   zoomAlign    — the focal point of a pointer-less zoom (zoomIn/zoomOut,
   *                  zoomTo, fit-mode switches). Pinch/ctrl+wheel always hold
   *                  the pointer instead — that is physics, not policy.
   *                  center/center = the view inflates around its middle;
   *                  y:'start' = the first visible line holds still.
   *   anchorAlign  — the viewport point that survives a reframe (viewport
   *                  resize, page rotation, spread/gap change): the view
   *                  anchor is captured there and restored there. start/start
   *                  = the browser scroll model (growth reveals below — a
   *                  container that mounts small and expands never shoves the
   *                  document down); center/center = canvas-style symmetric
   *                  resizes (the Figma feel).
   *
   * Named x values are logical (CSS-style: 'start' = reading start — the
   * right edge in RTL); fractions are physical, like screen coordinates.
   */
  fitAlign: Alignment;
  /** See {@link StageSettings.fitAlign} — where navigation lands, per axis. */
  arrivalAlign: ArrivalAlignment;
  /** See {@link StageSettings.fitAlign} — the pointer-less zoom focal point. */
  zoomAlign: AlignmentValue;
  /** See {@link StageSettings.fitAlign} — the viewport point reframes hold. */
  anchorAlign: AlignmentValue;
  /**
   * A non-persistent view rotation: a quarter-turn (clockwise) applied to how
   * every page is displayed in this lens, on top of each page's own /Rotate —
   * Adobe's "Rotate View". A display setting like `zoom` or `layout`: per lens
   * (the main viewer can rotate while a thumbnail lens stays upright), never
   * written to the document, gone when the lens resets. The permanent
   * counterpart — writing /Rotate into the PDF — is plugin-page-edit's
   * `rotateBy`/`setRotation`.
   */
  viewRotation: PageRotation;
  /** Zoom intent: a fit-mode (automatic/fit-page/fit-width/fit-all) or a fixed level. */
  zoom: ZoomSpec;
  /** Default behavior for goToPage, nextPage and previousPage. */
  scrollBehavior: ScrollBehaviorKind;
  /**
   * View pixels per PDF point — the platform's physical unit factor, folded into
   * the layout so 100% (zoom 1) is physically accurate. Web = 96/72 (1 pt = 1/72",
   * 1 CSS px = 1/96"); a native platform injects its own (iOS pt, Android dp). It
   * scales every page's world size (and thus `contentScale`), so the camera math,
   * `gap`/`padding`/`pageFrame` (world units), and absolute-px zoom modes
   * (`pageWidth`) are all unaffected — only the pages themselves resize.
   */
  viewUnitsPerPoint: number;
}

/**
 * A laid-out page handed to the shell.
 *  - PageBox + `ref`: layout truth (world coords + identity) — the shell uses
 *    `x/y/width/height` only to position the page container.
 *  - `transform`: presentation truth — the single bridge between PDF points,
 *    view px, and device px for this page. Plugins do all coordinate work
 *    through it (`contentToView` / `viewToContent` / `deviceWidth` / `cssMatrix`),
 *    never by re-deriving `x * scale` / `* dpr`. Page-local, so it's
 *    camera/pan-invariant.
 */
export interface VisiblePage extends PageBox {
  ref: PageRef;
  /**
   * The page's display-box (footprint) top-left in screen px, camera-resolved and
   * snapped to the device grid. The shell positions the page container at this —
   * snapping here (not in the adapter) keeps a CSS-rotated page on the pixel grid
   * for every framework, with no hand-rounding.
   */
  screenX: number;
  screenY: number;
  transform: PageTransform;
  /**
   * The page region actually on screen, in un-rotated page points (y-down) —
   * viewport ∩ footprint inverted through the transform (exact for
   * quarter-turns). Zero-sized when the page sits outside the viewport.
   * Visibility is the stage's data (it already intersects viewport × pages to
   * virtualize); adapters and demand consumers (tiling's `PageViewDemand`)
   * read it instead of re-deriving camera math per framework.
   */
  visibleRect: Rect;
}

/**
 * A page-relative view memento: "what I'm looking at and how zoomed". The durable
 * currency for per-page view memory (construction worksheets): capture with
 * `getViewpoint()`, restore with `goToPage(page, { viewpoint })`. Survives resizes
 * because the anchor is page-relative and fit-modes re-resolve.
 */
export interface Viewpoint {
  anchor: Anchor;
  zoom: ZoomSpec;
}

/** Durable, serializable view state — the unit of session persistence. */
export interface StageViewState extends StageSettings {
  cursor: number;
  anchor: Anchor;
}

/**
 * Host timing seam. The pure core (stage-core) never touches time; the camera tween
 * lives in this (impure) shell and asks for frames through a Scheduler. The default
 * is the browser's requestAnimationFrame; inject a fake in tests, or an instant one
 * in Node/SSR.
 */
export interface Scheduler {
  /** Run the callback on the next frame; returns a handle for cancellation. */
  raf(callback: (timestampMs: number) => void): number;
  /** Cancel a scheduled callback. */
  caf(handle: number): void;
}

/**
 * Options for the scroller writes — `Element.scrollTo` semantics: absolute
 * offsets (screen px) into the current scroll range (see
 * {@link StageHostCapability.getScrollMetrics}); an omitted axis does not move.
 * `behavior` defaults to 'instant' (the DOM's 'auto'), not the stage's
 * `scrollBehavior` setting — that setting governs navigation verbs, and a
 * scrollbar thumb must track the pointer exactly.
 */
export interface StageScrollToOptions {
  left?: number;
  top?: number;
  behavior?: ScrollBehaviorKind;
}

/** Options for navigation intents. */
export interface GoToOptions {
  behavior?: ScrollBehaviorKind;
  /** Restore this exact viewpoint instead of fresh placement (per-page memory). */
  viewpoint?: Viewpoint;
  /** Override the landing for this navigation only (explicit beats default). */
  arrivalAlign?: Partial<ArrivalAlignment>;
}

/**
 * One axis of a reveal arrival — `scrollIntoView` vocabulary plus two
 * PDF-protocol necessities:
 *   absent     → minimal movement: scroll only if the target is off-screen
 *                (CSS 'nearest', as a bare reveal does)
 *   'keep'     → this axis does not move at all (PDF /XYZ null coordinate)
 *   'start'    → target edge at the viewport start (plus padding)
 *   'center'   → target centered
 *   'end'      → target edge at the viewport end (minus padding)
 *   number 0–1 → target center at this viewport fraction (0.35 = "top middle",
 *                the browser find-bar feel)
 */
export type RevealAnchorValue = 'keep' | 'start' | 'center' | 'end' | number;

export interface RevealAnchor {
  x?: RevealAnchorValue;
  y?: RevealAnchorValue;
}

/**
 * What happens to zoom on a reveal — always relative to the reveal's target
 * rect (the whole page when no `rect` is given):
 *   'keep'       → pure pan, zoom untouched (search hits, /XYZ null zoom)
 *   { level }    → explicit factor (/XYZ zoom)
 *   'fit'        → the rect fully visible (/FitR; /Fit, /FitB via rect=page/bbox)
 *   'fit-width'  → the rect's width fills the viewport (/FitH, /FitBH)
 *   'fit-height' → the rect's height fills the viewport (/FitV, /FitBV)
 */
export type RevealZoom = 'keep' | 'fit' | 'fit-width' | 'fit-height' | { level: number };

/**
 * Options for `reveal` — the follower-UI arrival verb (search hits, outline
 * clicks, PDF destinations, "jump to comment").
 *
 * With none of `rect`/`zoom`/`anchor` set, a reveal is minimal movement to
 * make the page visible, with the cursor untouched.
 * A positioned reveal (any of the three set) is "you are now looking at
 * this spot": the camera places the target per the anchor, a zoom
 * directive resolves to a concrete level (recorded as the zoom intent),
 * and the cursor follows the camera — while still clamping against the
 * normal camera bounds, so anchors are best-effort near document edges.
 */
export interface RevealOptions {
  behavior?: ScrollBehaviorKind;
  /**
   * Target rect on the page in the viewer's coordinates (y-down,
   * crop-relative, unscaled points — the same `Rect` selection/search rects
   * and `CommentThreadView.contentRect` live in). Absent or `null` → the
   * whole page (null accepted so nullable sources flow in directly). A
   * zero-size rect is a point (/XYZ).
   */
  rect?: Rect | null;
  zoom?: RevealZoom;
  anchor?: RevealAnchor;
}

// ── events ──
export interface StagePageChangedEvent {
  readonly page: PageInfo | null;
  readonly pageIndex: number;
  readonly previousPageIndex: number;
}
export interface StageZoomChangedEvent {
  readonly level: number;
  readonly previousLevel: number;
  readonly mode: ZoomModeValue | 'custom';
}
export interface StageCameraChangedEvent {
  readonly camera: Camera;
}
export interface StageMotionEndedEvent {
  readonly camera: Camera;
}
export interface StageSettingsChangedEvent {
  readonly settings: StageSettings;
  readonly changed: readonly (keyof StageSettings)[];
}
export interface StageViewportChangedEvent {
  readonly size: Size;
}

/** A viewport-space point or rect: this stage's container px, top-left origin. */
export type ViewportPoint = Point;
export type ViewportRect = Rect;

export interface ZoomToOptions {
  /** Hold this viewport point fixed while the level changes (default: the `zoomAlign` point). */
  readonly around?: ViewportPoint;
}

/**
 * The stage's public contract: the camera, layout, zoom and navigation of one
 * presentation of a document. Pointer and surface plumbing (viewport size,
 * gesture brackets, fling, world space, initial placement) live on the host
 * contract (`@embedpdf/plugin-stage/contract/host`).
 */
export interface StageCapability {
  // ── reading the view ──
  /** Camera origin (world units) and zoom. */
  getCamera(): Camera;
  /** Write the camera directly; marks the cause as user motion. */
  setCamera(camera: Camera): void;
  /** The container size the stage was told about. */
  getViewportSize(): Size;
  /** Resolved zoom factor. */
  getZoomLevel(): number;
  /** The active zoom intent: a fit mode, or 'custom' for a fixed level. */
  getZoomMode(): ZoomModeValue | 'custom';
  /** The lens's view rotation — see {@link StageSettings.viewRotation}. */
  getViewRotation(): PageRotation;
  /** The cursor page, or null before the document has pages. */
  getCurrentPage(): PageInfo | null;
  /** The cursor page's display index. */
  getCurrentPageIndex(): number;
  /** Pages of the current item (one page, or a spread / grid row). */
  listCurrentItemPages(): readonly PageInfo[];
  /** Pages on screen, with their viewport rects and visible page-space rect. Reference-stable. */
  listVisiblePages(): readonly VisiblePage[];
  /** Is any part of the page on screen. */
  isPageVisible(page: PageRef): boolean;
  /** What the viewer is looking at plus the zoom intent, for per-page view memory. */
  getViewpoint(): Viewpoint;
  /** Serialisable view state — the unit of session persistence. */
  getViewState(): StageViewState;
  /** Restore a saved view state; the responsive rules re-assert on top of its settings. */
  applyViewState(view: StageViewState): void;
  /** A tween or fling is running. */
  isMoving(): boolean;
  /** Halt any running tween or fling where it is. */
  stopMotion(): void;

  // ── zoom ──
  /** Set a fixed level (a bare number) or a fit mode. */
  zoomTo(zoom: number | ZoomSpec, options?: ZoomToOptions): void;
  /** Multiply the zoom, holding a viewport point fixed (default: the `zoomAlign` point). */
  zoomBy(factor: number, options?: ZoomToOptions): void;
  /** Zoom in one step around the `zoomAlign` point. */
  zoomIn(): void;
  /** Zoom out one step around the `zoomAlign` point. */
  zoomOut(): void;
  /** Zoom so the page width fills the viewport. */
  fitWidth(): void;
  /** Zoom so the whole page fits the viewport. */
  fitPage(): void;
  /** Fit the whole scene (every page) in view. */
  fitAll(): void;
  /** Fit width but never upscale past 100% (Adobe's "Automatic"). */
  fitAutomatic(): void;

  // ── navigation ──
  /** Navigate to a page by identity. Fresh arrival places by the unit rule; pass `viewpoint` to restore. */
  goToPage(page: PageRef, options?: GoToOptions): void;
  /** Navigate by zero-based display index. */
  goToPageIndex(index: number, options?: GoToOptions): void;
  goToFirstPage(options?: GoToOptions): void;
  goToLastPage(options?: GoToOptions): void;
  /** Step forward / backward by the navigation unit (the item if it fits the viewport, else the page). */
  nextPage(options?: GoToOptions): void;
  previousPage(options?: GoToOptions): void;
  /** The cursor is before the last page. */
  canGoNext(): boolean;
  /** The cursor is after the first page. */
  canGoPrevious(): boolean;
  /**
   * Bring a page, or a page-space rect on it, into view. Bare: minimal movement,
   * cursor untouched. Positioned (`rect`/`zoom`/`anchor`): the target lands at
   * the anchor and the cursor follows.
   */
  reveal(page: PageRef, options?: RevealOptions): void;
  /** `reveal` by display index. */
  revealIndex(index: number, options?: RevealOptions): void;
  /** Sugar: a positioned reveal of a page-space rect. */
  revealRect(page: PageRef, rect: Rect, options?: Omit<RevealOptions, 'rect'>): void;
  /** `Element.scrollTo` / `scrollBy` for the camera, in viewport px. */
  scrollTo(options: StageScrollToOptions): void;
  scrollBy(options: StageScrollToOptions): void;
  /** Pan by a viewport delta. */
  panBy(dxViewport: number, dyViewport: number): void;
  /** Back to the first page at the current zoom intent. */
  resetView(): void;

  // ── rotation ──
  /** Set the lens's view rotation (see {@link StageSettings.viewRotation}). */
  setViewRotation(rotation: PageRotation): void;
  /** Turn the view rotation a quarter clockwise (90) or counter-clockwise (-90). */
  rotateViewBy(delta: 90 | -90): void;

  // ── settings ──
  /** Every live setting (build or save a preset). */
  getSettings(): StageSettings;
  /** Patch any subset in one anchor-preserving update. Writes the responsive base. */
  updateSettings(patch: Partial<StageSettings>): void;
  /** Back to the constructed config. */
  resetSettings(): void;
  setFlow(flow: FlowMode): void;
  setLayout(layout: LayoutKind): void;
  setSpread(spread: SpreadMode): void;
  setSizing(sizing: SizingMode): void;
  /** Replace the container-query rules (see {@link ResponsiveRule}). */
  setResponsiveRules(rules: readonly ResponsiveRule[]): void;
  /** Names of the responsive rules matching the current box, in source order. */
  listActiveRules(): readonly string[];
  /** Whether the named responsive rule matches the current box. */
  matchesRule(name: string): boolean;

  // ── geometry ──
  /** The page under a viewport point and the page-space point on it; null over a gap. */
  getPageAt(point: ViewportPoint): {
    ref: PageRef;
    point: Point;
    scale: number;
    /** The hit page's total display rotation (document /Rotate + view rotation). */
    rotation: PageRotation;
    /** The hit page's zoom relative to its 100% baseline. */
    zoom: number;
  } | null;
  /** Project a viewport point onto one page's frame, unclamped; null when the page is not laid out. */
  viewportToPage(page: PageRef, point: ViewportPoint): Point | null;
  /** A page-space point → this stage's viewport. */
  pageToViewport(page: PageRef, point: Point): ViewportPoint | null;
  /** A page-space rect → its viewport-space bounding box. */
  pageRectToViewport(page: PageRef, rect: Rect): ViewportRect | null;
  /** The laid-out box for a page, or null before placement. */
  getPageFrame(page: PageRef): VisiblePage | null;

  // ── events ──
  /** The cursor page changed. */
  readonly onPageChanged: EventHook<StagePageChangedEvent>;
  /** The camera's zoom level changed. */
  readonly onZoomChanged: EventHook<StageZoomChangedEvent>;
  /** Coalesced per camera write, not per frame. */
  readonly onCameraChanged: EventHook<StageCameraChangedEvent>;
  /** A tween or fling settled, or was stopped. */
  readonly onMotionEnded: EventHook<StageMotionEndedEvent>;
  /** One or more settings changed value; `changed` names them. */
  readonly onSettingsChanged: EventHook<StageSettingsChangedEvent>;
  /** The host reported a new viewport size. */
  readonly onViewportChanged: EventHook<StageViewportChangedEvent>;
}

export interface StageConfig extends Partial<StageSettings> {
  /** Override the host timing seam (tests/SSR). Defaults to browser rAF. */
  scheduler?: Scheduler;
  /**
   * Container queries for the settings bag (see {@link ResponsiveRule}).
   * Defaults to `DEFAULT_RESPONSIVE` (compact containers get the thin phone
   * gutter); pass `[]` to opt out entirely.
   */
  responsive?: readonly ResponsiveRule[];
}

/**
 * Options for registering a stage instance. The stage is a lens, not a
 * singleton: a document may be viewed through several stages at once (the
 * main view, a wrapped thumbnail sidebar, …), each with its own camera and
 * settings. Register an additional lens with its own `id` and `token`:
 *
 *   const ThumbsToken = createCapabilityToken<StageCapability>('stage-thumbs');
 *   plugins = [
 *     stagePlugin(),                                                   // main lens
 *     stagePlugin({ id: 'stage-thumbs', token: ThumbsToken,
 *                   layout: 'grid', columns: 'auto', zoom: { level: 0.2 } }),
 *   ];
 *
 * State, capabilities and teardown are keyed by plugin id × document in the
 * kernel, so lenses never share anything.
 */
export interface StagePluginOptions extends StageConfig {
  id?: string;
  token?: CapabilityToken<StageCapability>;
}
