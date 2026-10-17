/**
 * The page context: what a page surface (a Stage page, a `PageView`) hands the layers drawn on
 * it. A layer depends only on this, never on the Stage, so the same layer works on both.
 *
 * Its client-space conversions measure the page's content box on screen when they run, and leave
 * the rotation and scale math to the page transform (`pageTransform` in `@embedpdf/core-geometry`),
 * so no adapter derives it again. The types are structural, like the rest of this package: an
 * adapter names its page context with the geometry's `PageTransform` and the render plugin's
 * `PageViewDemand`.
 */
import type { PageRef } from './page-ref';

interface ContextPoint {
  x: number;
  y: number;
}

interface ContextRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** The bands reserved around a page for its chrome, in screen pixels per side. */
export interface PageFrameShape {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

/** What the conversions need from the page transform; `PageTransform` satisfies it. */
export interface PageContextTransform {
  viewToPage(point: ContextPoint): ContextPoint;
  pageToView(point: ContextPoint): ContextPoint;
  pageToViewRect(rect: ContextRect): ContextRect;
}

/** Where the page's content box is on screen, in client pixels: `getBoundingClientRect()`. */
export interface ClientBox {
  readonly left: number;
  readonly top: number;
}

/** Between client (screen) pixels and points on one page. */
export interface PageClientSpace {
  /** A client (screen) point to a point on the page: the one platform-bound hit test. */
  toPagePoint(clientX: number, clientY: number): ContextPoint;
  /**
   * A point on the page to client pixels, the exact inverse of `toPagePoint` (rotation applied),
   * so UI in the view can anchor to a page point without a Stage camera.
   */
  toClientPoint(point: ContextPoint): ContextPoint;
  /** A box on the page to the client-pixel box around it: the box twin of `toClientPoint`. */
  toClientRect(rect: ContextRect): ContextRect;
}

/**
 * The page context. `Transform` is the page transform (`PageTransform`), `Demand` what the view
 * wants rendered (`PageViewDemand`).
 */
export interface PageContext<
  Transform extends PageContextTransform,
  Demand,
> extends PageClientSpace {
  documentId: string;
  /**
   * The page's durable address: use it for keys, rendering and annotations (read
   * `ref.objectNumber` where a map key is needed). The same object for the surface's lifetime,
   * so layers may key their work on it.
   */
  ref: PageRef;
  /** The display index (page N), from 0: for ordering and page numbers people read. */
  pageIndex: number;
  /**
   * The bands reserved around the page, in screen pixels per side. The page chrome draws into
   * the outer box (content and frame): a label in the bottom band is
   * `bottom: 0; height: frame.bottom`.
   */
  frame: PageFrameShape;
  /**
   * The one bridge between PDF points, view pixels and device pixels for this page: `toPixels`
   * to place content, `renderScale` and `deviceWidth` to render, `contentWidth` for sizes
   * relative to the page. Never multiply by the scale or the device pixel ratio yourself.
   */
  transform: Transform;
  /**
   * What the page's view wants rendered, as a pull the host fills: a Stage reads the page's
   * visible part live at call time (a zero box while it is off screen, see
   * {@link stagePageDemand}); a surface without a camera leaves it out, which means the whole
   * page.
   */
  getViewDemand?: () => Demand;
  /**
   * The hosting view's identity: the stage lens id (`stage.getLensId()`) or a per-instance
   * `PageView` id. Per-view raster planning (tiles) keys its state by it, so two views showing
   * the same page never fight over one plan.
   */
  view: string;
}

/**
 * The client-space conversions of a page whose content box `box()` measures on screen when a
 * conversion runs: client pixels to box-local view pixels, then the transform undoes the turn
 * and the scale. `toPagePoint` and `toClientPoint` read the same live box, so they never drift.
 */
export function pageClientSpace(
  transform: () => PageContextTransform,
  box: () => ClientBox,
): PageClientSpace {
  return {
    toPagePoint: (clientX, clientY) => {
      const origin = box();
      return transform().viewToPage({ x: clientX - origin.left, y: clientY - origin.top });
    },
    toClientPoint: (point) => {
      const origin = box();
      const viewPoint = transform().pageToView(point);
      return { x: origin.left + viewPoint.x, y: origin.top + viewPoint.y };
    },
    toClientRect: (rect) => {
      const origin = box();
      const viewRect = transform().pageToViewRect(rect);
      return {
        x: origin.left + viewRect.x,
        y: origin.top + viewRect.y,
        width: viewRect.width,
        height: viewRect.height,
      };
    },
  };
}

/**
 * Build a page context. `getRect` is the page's content box on screen (the turned content
 * element's bounding box), read when a conversion runs.
 */
export function makePageContext<Transform extends PageContextTransform, Demand = never>(
  documentId: string,
  view: string,
  ref: PageRef,
  pageIndex: number,
  frame: PageFrameShape,
  transform: Transform,
  getRect: () => ClientBox,
  getViewDemand?: () => Demand,
): PageContext<Transform, Demand> {
  return {
    documentId,
    view,
    ref,
    pageIndex,
    frame,
    transform,
    ...(getViewDemand ? { getViewDemand } : {}),
    ...pageClientSpace(() => transform, getRect),
  };
}

/**
 * A page context that reads every member through `current()`: the same object for a surface's
 * lifetime, current in what it answers. For an adapter whose layers keep the object they were
 * given once (a Svelte component reads `page.transform` in a template and follows the zoom).
 */
export function livePageContext<Context extends PageContext<PageContextTransform, unknown>>(
  current: () => Context,
): Context {
  const live: PageContext<PageContextTransform, unknown> = {
    get documentId() {
      return current().documentId;
    },
    get ref() {
      return current().ref;
    },
    get pageIndex() {
      return current().pageIndex;
    },
    get frame() {
      return current().frame;
    },
    get transform() {
      return current().transform;
    },
    get view() {
      return current().view;
    },
    get getViewDemand() {
      return current().getViewDemand;
    },
    toPagePoint: (clientX, clientY) => current().toPagePoint(clientX, clientY),
    toClientPoint: (point) => current().toClientPoint(point),
    toClientRect: (rect) => current().toClientRect(rect),
  };
  return live as Context;
}
