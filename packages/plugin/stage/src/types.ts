import { createCapabilityToken } from '@embedpdf/core';
import type { PageObjectNumber } from '@embedpdf/core';
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

export type LayoutKind = 'vertical' | 'horizontal' | 'grid';
/** Navigation (goToPage) either tweens the camera or jumps instantly. */
export type ScrollBehaviorKind = 'smooth' | 'instant';
/**
 * Presentation flow:
 *   'continuous' — the whole document is scrollable; the camera roams the full scene.
 *   'paged'      — one item (page or spread) at a time: the scene is a one-item
 *                  slice at the cursor, and next/prev step between items.
 */
export type FlowMode = 'continuous' | 'paged';
/**
 * Grid column policy:
 *   'square' — ≈√n columns (the classic canvas arrangement)
 *   'auto'   — WRAPPED: as many columns as fit the viewport line at the current
 *              zoom (the responsive thumbnail-sidebar behavior; re-wraps on resize)
 *   number   — a fixed column count
 */
export type GridColumns = 'square' | 'auto' | number;

/**
 * Space between items — the value's shape carries the unit (like ZoomSpec):
 *   number     — WORLD units: the gap is part of the canvas and scales with zoom,
 *                so the whole scene zooms as one rigid object (the document feel).
 *   { px: n }  — SCREEN px: UI-stable spacing, the same in every document at every
 *                zoom (the browser-of-items feel: thumbnails, organizers).
 */
export type Gap = number | { px: number };

/**
 * One axis of the ARRIVAL policy — stage-core's AlignValue ('start' |
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
 * The Stage's orthogonal, independently-settable primitives. Every field can be set
 * on its own (setLayout, setBounded, …) or several at once via `update()`. A
 * "preset" is just a `Partial<StageSettings>` the app keeps and applies — no preset
 * machinery lives here.
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
  /** Clamp the camera to the content? Off = free infinite pan (plans / CAD). */
  bounded: boolean;
  /**
   * Breathing room (screen px) around the content — the one spacing concept.
   * Fit-modes inset by it, arrivals leave it as a gutter, and the clamp lets the
   * camera reveal exactly this much beyond each content edge.
   */
  padding: number;
  /**
   * Space BETWEEN items — and between the halves of a spread. A number is world
   * units (scales with zoom — the canvas feel); `{ px }` is screen px (UI-stable
   * — the thumbnail feel). See {@link Gap}.
   */
  gap: Gap;
  /**
   * Reserved chrome real estate around EACH PAGE, in SCREEN px — one thickness
   * per side. The page content is inset by these; the bands hold box-space
   * chrome (a label below, a button row above, side rails) painted by the app
   * via the adapter's `pageChrome` slot. Per page, not per item: in a spread
   * every page keeps its own flanks. Constant screen px (unaffected by zoom).
   *
   * Naming rule for this settings bag: every setting describes the STAGE itself
   * (the container) — `padding`, `gap`, `layout`, … The rare setting owned by the
   * page carries the `page` prefix (`pageFrame`; `pageWidth` in zoom).
   */
  pageFrame: PageFrame;
  /**
   * Reading direction. RTL: horizontal items advance leftward, spreads bind on the
   * right, grid rows fill right→left, and alignment 'start' on x means the RIGHT
   * edge (logical, CSS-style). Navigation is index-based and never changes.
   */
  direction: Direction;
  /**
   * The alignment family — EVERY camera move is defined by what it holds
   * fixed. Gestures (pan/pinch/wheel) hold the pointer: physics, no setting.
   * Explicit arrivals (positioned reveal, destinations, viewpoints) hold
   * whatever the call specifies. These four settings govern the rest:
   *
   *   fitAlign     — the standing CONSTRAINT: where content rests on an axis
   *                  the camera cannot travel (it fits the TRUE bounds — the
   *                  scene in continuous flow, the item slice in paged). The
   *                  clamp enforces it on every camera write — which is why a
   *                  fitting axis settles identically whatever arrivalAlign
   *                  says. center/center = document feel; y:'start' = sidebar
   *                  thumbnails hugging the top.
   *   arrivalAlign — the landing POLICY: where navigation (goToPage, next/
   *                  prev, reset) puts the target — THE SAME at every zoom.
   *                  start/start = reading (top-left, direction-aware);
   *                  center/center = presentation/drawings (Drawboard feel);
   *                  y: 0.35 = the find-bar line; 'keep' = don't move an axis.
   *   zoomAlign    — the FOCAL point of a pointer-less zoom (zoomIn/zoomOut,
   *                  zoomTo, fit-mode switches). Pinch/ctrl+wheel always hold
   *                  the pointer instead — that is physics, not policy.
   *                  center/center = the view inflates around its middle;
   *                  y:'start' = the first visible line holds still.
   *   anchorAlign  — the viewport point that SURVIVES a reframe (viewport
   *                  resize, page rotation, spread/gap change): the view
   *                  anchor is captured there and restored there. start/start
   *                  = the browser scroll model (growth reveals below — a
   *                  container that mounts small and expands never shoves the
   *                  document down); center/center = canvas-style symmetric
   *                  resizes (the Figma feel).
   *
   * Named x values are LOGICAL (CSS-style: 'start' = reading start — the
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
   * NON-PERSISTENT view rotation: a quarter-turn (clockwise) applied to how
   * EVERY page is DISPLAYED in this lens, on top of each page's own /Rotate —
   * Adobe's "Rotate View". A display setting like `zoom` or `layout`: per lens
   * (the main viewer can rotate while a thumbnail lens stays upright), never
   * written to the document, gone when the lens resets. The PERMANENT
   * counterpart — writing /Rotate into the PDF — is plugin-page-edit's
   * `rotateBy`/`setRotation`.
   */
  viewRotation: PageRotation;
  /** Zoom intent: a fit-mode (automatic/fit-page/fit-width/fit-all) or a fixed level. */
  zoom: ZoomSpec;
  /** Default behaviour for goToPage/next/prev. */
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
 *  - PageBox + `pon`: LAYOUT truth (world coords + identity) — the shell uses
 *    `x/y/width/height` only to POSITION the page container.
 *  - `transform`: PRESENTATION truth — the single bridge between PDF points,
 *    view px, and device px for this page. Plugins do ALL coordinate work
 *    through it (`pageToView` / `viewToPage` / `deviceWidth` / `cssMatrix`),
 *    never by re-deriving `x * scale` / `* dpr`. Page-local, so it's
 *    camera/pan-invariant.
 */
export interface VisiblePage extends PageBox {
  pon: PageObjectNumber;
  /**
   * The page's DISPLAY-box (footprint) top-left in screen px, camera-resolved and
   * snapped to the device grid. The shell positions the page container at this —
   * snapping here (not in the adapter) keeps a CSS-rotated page on the pixel grid
   * for every framework, with no hand-rounding.
   */
  screenX: number;
  screenY: number;
  transform: PageTransform;
  /**
   * The page region actually ON SCREEN, in UN-rotated page points (y-down) —
   * viewport ∩ footprint inverted through the transform (exact for
   * quarter-turns). Zero-sized when the page sits outside the viewport.
   * Visibility is the STAGE's data (it already intersects viewport × pages to
   * virtualize); adapters and demand consumers (tiling's `PageViewDemand`)
   * read it instead of re-deriving camera math per framework.
   */
  visibleRect: Rect;
}

export interface StageState extends StageSettings {
  camera: Camera;
  /**
   * False while the ZOOM is in motion, true once it has rested (~150ms of
   * frames without a zoom write). Device-snapping of page origins is gated
   * on this: a continuous zoom and a snapped origin cannot coexist without
   * the anchor point jittering ±0.5 device px per step (the rounding lands
   * differently every frame), so pages place fractionally while zooming and
   * snap once at rest — when crispness actually matters. Pans always snap
   * (a pure translation snap has no anchor error). Transient like `camera`.
   */
  cameraResting: boolean;
  vp: Size;
  /**
   * Device pixels per view pixel (web: `window.devicePixelRatio`). Reported by
   * the shell like the viewport; feeds each page's transform so bitmaps render
   * crisp (exact device px) and boxes land on the device grid. Defaults to 1.
   */
  dpr: number;
  /**
   * The current page — transient like `camera` (NOT a setting), valid in BOTH flows.
   * Navigation sets it; in continuous flow scrolling syncs it from the camera; in
   * paged flow panning never moves it (the scene is a one-item slice at this page).
   * Stored as a page index so it survives spread/layout regrouping.
   */
  cursor: number;
}

export type StageAction =
  | { type: 'CAMERA'; camera: Camera }
  | { type: 'CAMERA_REST'; resting: boolean }
  | { type: 'VP'; vp: Size }
  | { type: 'DPR'; dpr: number }
  | { type: 'CURSOR'; cursor: number }
  | { type: 'PATCH'; patch: Partial<StageSettings> };

/**
 * A page-relative view memento: "what I'm looking at and how zoomed". The durable
 * currency for per-page view memory (construction worksheets) — capture with
 * `viewpoint()`, restore with `goToPage(i, { viewpoint })`. Survives resizes
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
 * {@link StageCapability.scrollMetrics}); an omitted axis does not move.
 * `behavior` defaults to 'instant' (the DOM's 'auto'), NOT the stage's
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
  /** Override the landing for THIS navigation only (explicit beats default). */
  arrivalAlign?: Partial<ArrivalAlignment>;
}

/**
 * One axis of a reveal arrival — `scrollIntoView` vocabulary plus two
 * PDF-protocol necessities:
 *   absent     → minimal movement: scroll only if the target is off-screen
 *                (CSS 'nearest'; today's reveal semantics)
 *   'keep'     → this axis does not move AT ALL (PDF /XYZ null coordinate)
 *   'start'    → target edge at the viewport start (plus padding)
 *   'center'   → target centered
 *   'end'      → target edge at the viewport end (minus padding)
 *   number 0–1 → target CENTER at this viewport fraction (0.35 = "top middle",
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
 * With none of `rect`/`zoom`/`anchor` set, reveal keeps its original
 * semantics: minimal movement to make the page visible, cursor untouched.
 * A POSITIONED reveal (any of the three set) is "you are now looking at
 * THIS spot": the camera places the target per the anchor, a zoom
 * directive resolves to a concrete level (recorded as the zoom intent),
 * and the cursor follows the camera — while still clamping against the
 * normal camera bounds, so anchors are best-effort near document edges.
 */
export interface RevealOptions {
  behavior?: ScrollBehaviorKind;
  /**
   * CONTENT-space target rect on the page (y-down, crop-relative, unscaled
   * points — the same space selection/search rects live in). Absent → the
   * whole page. A zero-size rect is a point (/XYZ).
   */
  rect?: Rect;
  zoom?: RevealZoom;
  anchor?: RevealAnchor;
}

/** The Stage's public contract: selectors (reads) + intents (the only writers). */
export interface StageCapability {
  // ── selectors ──
  camera(): Camera;
  viewport(): Size;
  /**
   * The camera as a NATIVE SCROLLER — the DOM scroll vocabulary in screen px:
   * `scrollTop`/`scrollHeight`/`clientHeight` (and the x twins) mean exactly
   * what they mean on a DOM element; `scrollableX/Y` false ⇔ nothing to scroll
   * on that axis (native: no bar). Derived from the SAME travel range the pan
   * clamp uses — paged flow reads the one-item slice — so a scrollbar built on
   * it can never disagree with where panning stops. On an UNBOUNDED stage the
   * range is the union of the padded content and the current window (the Figma
   * bar): pan away and it grows, the thumb shrinking toward the edge but always
   * remaining a road back. Reference-stable until a field actually changes.
   */
  scrollMetrics(): ScrollMetrics;
  pageCount(): number;
  visiblePages(): VisiblePage[];
  /** The current page (the cursor) — valid in both flows. */
  currentPage(): number;
  /** The display indices of the current item's pages (1 page, or a spread's pages). */
  currentItemPages(): number[];
  /** The full page list with PDF labels — for page thumbnails / worksheet tabs. */
  pages(): Array<{ index: number; pon: PageObjectNumber; label: string | null }>;
  /** The laid-out box for a page by its durable pon. */
  pageRect(pon: PageObjectNumber): VisiblePage | null;
  /**
   * Screen point (this Stage's container px) → the page under it + its content
   * point, or null over a gap. The viewport-level hit-test the interaction hub
   * needs so a single pointer source can drive page-aware features (text
   * selection, annotations) AND cross-page drags.
   */
  pageAt(screen: Point): {
    pon: PageObjectNumber;
    point: Point;
    scale: number;
    /** The hit page's TOTAL display rotation (document /Rotate + view rotation). */
    rotation: PageRotation;
    /** The hit page's zoom relative to its 100% baseline (`transform.zoom`). */
    zoom: number;
  } | null;
  /**
   * Screen point → `pon`'s content space, UNCLAMPED — valid even when the point
   * is outside the page's bounds (coordinates then fall outside `[0, size]`).
   * The frame-stable projection a page-anchored gesture (annotation move/resize)
   * tracks with, where `pageAt` would re-resolve to whatever page is under the
   * cursor (what a cross-page drag like text selection wants). Null when the
   * page isn't currently laid out.
   */
  pointOnPage(pon: PageObjectNumber, screen: Point): Point | null;
  /**
   * Page space (intrinsic PDF points) → world space. Applies the page's placed
   * origin and contentScale — the transform sizing policies introduce. Compose
   * with toScreen for viewport-space overlays anchored to page content.
   */
  pageToWorld(pon: PageObjectNumber, pt: Point): Point | null;
  /**
   * Content rect on a page → this Stage viewport's screen-space AABB. Applies page
   * rotation/contentScale and the current camera. Use for upright viewport overlays
   * that need to frame a selected page region.
   */
  pageRectToScreen(pon: PageObjectNumber, rect: Rect): Rect | null;
  toScreen(world: Point): Point;
  toWorld(screen: Point): Point;
  flow(): FlowMode;
  layout(): LayoutKind;
  spread(): SpreadMode;
  sizing(): SizingMode;
  columns(): GridColumns;
  bounded(): boolean;
  padding(): number;
  gap(): Gap;
  pageFrame(): PageFrame;
  fitAlign(): Alignment;
  arrivalAlign(): ArrivalAlignment;
  zoomAlign(): AlignmentValue;
  anchorAlign(): AlignmentValue;
  direction(): Direction;
  scrollBehavior(): ScrollBehaviorKind;
  /** The lens's view rotation — see {@link StageSettings.viewRotation}. */
  viewRotation(): PageRotation;
  zoomLevel(): number;
  /** The active zoom intent: a fit-mode, or 'custom' for a fixed level. */
  zoomMode(): ZoomModeValue | 'custom';
  /** What I'm looking at + zoom intent — capture for per-page view memory. */
  viewpoint(): Viewpoint;
  /** A snapshot of all settings (handy for building/saving a customer preset). */
  settings(): StageSettings;
  viewState(): StageViewState;

  // ── intents ──
  setViewport(vp: Size): void;
  /** Report the device pixel ratio (web: `devicePixelRatio`). The shell calls
   *  this once on mount and whenever it changes (e.g. dragging between monitors)
   *  so page transforms render crisp. */
  setDevicePixelRatio(dpr: number): void;
  setCamera(c: Camera): void;
  panBy(dxScreen: number, dyScreen: number): void;
  /** `Element.scrollTo` for the camera: absolute offsets into the scroll range
   *  (see {@link StageScrollToOptions}) — clamped into it, cursor-synced, zoom
   *  untouched (scrolling is a pan in scroller clothing). */
  scrollTo(opts: StageScrollToOptions): void;
  /** `Element.scrollBy`: relative offsets — sugar over `scrollTo`. */
  scrollBy(opts: StageScrollToOptions): void;
  zoomAround(screenPt: Point, factor: number): void;
  zoomIn(): void;
  zoomOut(): void;
  zoomTo(spec: ZoomSpec): void;
  fitWidth(): void;
  fitPage(): void;
  /** Fit the whole scene (every page) in view — the construction overview. */
  fitAll(): void;
  /** Fit width but never upscale past 100% (Adobe's "Automatic"). */
  automatic(): void;
  /**
   * Re-resolve the active zoom intent and re-place against the CURRENT scene,
   * preserving the anchored page-point. Call after the page geometry changes
   * underneath the lens — rotate/move/delete — so fit/pixel zoom modes
   * (`fitPage`, `pageWidth`, …) recompute against the new footprint. A no-op
   * before the first placement; for a fixed `{ level }` zoom it just re-anchors.
   * Wired automatically to the document's page-registry revision; exposed for
   * any external geometry change a host wants to react to.
   */
  refit(): void;
  /** Go to a page. Fresh arrival places by the unit rule; pass `viewpoint` to restore. */
  goToPage(pageIndex: number, opts?: GoToOptions): void;
  /**
   * The follower-UI arrival verb (thumbnail sidebars, search hits, outline
   * clicks, PDF destinations). Bare: make the page visible with minimal
   * movement — zero if it already is, cursor untouched (scrollIntoView
   * semantics; paged flow delegates to navigation since the page isn't in
   * the slice). POSITIONED (rect/zoom/anchor set — see {@link RevealOptions}):
   * place the target at the anchor, optionally re-zooming; the cursor
   * follows the camera.
   */
  reveal(pageIndex: number, opts?: RevealOptions): void;
  /** Step forward by the navigation unit (the item if it fits the viewport, else the page). */
  next(opts?: GoToOptions): void;
  /** Step backward by the navigation unit. */
  prev(opts?: GoToOptions): void;
  /** Set any subset of settings at once — ONE anchor-preserving update. The way to
   *  apply a customer preset: `update(myPreset)`. */
  update(patch: Partial<StageSettings>): void;
  setFlow(flow: FlowMode): void;
  setLayout(layout: LayoutKind): void;
  setSpread(spread: SpreadMode): void;
  setSizing(sizing: SizingMode): void;
  setColumns(columns: GridColumns): void;
  setBounded(bounded: boolean): void;
  setPadding(padding: number): void;
  setGap(gap: Gap): void;
  setPageFrame(pageFrame: PageFrame): void;
  setFitAlign(fitAlign: Alignment): void;
  setArrivalAlign(arrivalAlign: ArrivalAlignment): void;
  setZoomAlign(zoomAlign: AlignmentValue): void;
  setAnchorAlign(anchorAlign: AlignmentValue): void;
  setDirection(direction: Direction): void;
  /** Set the lens's view rotation to an absolute quarter-turn — see
   *  {@link StageSettings.viewRotation}. An anchor-preserving reframe, like a
   *  page rotation: the spot you were looking at stays put (`anchorAlign`). */
  setViewRotation(viewRotation: PageRotation): void;
  /** Rotate the view a quarter-turn from where it is (the toolbar verb) —
   *  relative sugar over {@link setViewRotation}, mirroring page-edit's `rotateBy`. */
  rotateView(delta: 90 | -90): void;
  setScrollBehavior(behavior: ScrollBehaviorKind): void;
  applyViewState(view: StageViewState): void;
  /** Offer a candidate initial view; the highest-priority non-null wins at placement. */
  provideInitialView(priority: number, provider: () => StageViewState | null): void;
  /** Resolve the registered providers once (else reset). Called when the viewport is ready. */
  placeInitial(): void;
  /** Back to the start: page 0, placed by the unit rule at the current zoom intent. */
  resetView(): void;
}

export interface StageConfig extends Partial<StageSettings> {
  /** Override the host timing seam (tests/SSR). Defaults to browser rAF. */
  scheduler?: Scheduler;
}

export const StageToken = createCapabilityToken<StageCapability>('stage');
