/**
 * The page context: what a layer drawn on a page knows about that page. A layer reads only
 * this, never the Stage, so the same layer works on a Stage's page and on a standalone page
 * view. Inside `<ng-template epdfPage>`, `let-page` gives it to the template and `injectPage()`
 * to a component.
 *
 * One context per page on screen, for as long as the page is shown: its identity never
 * changes, and what moves (`pageIndex`, `frame`, `transform`) are signals inside it. The
 * template outlet then keeps every layer while the camera moves, and a camera frame updates
 * only the bindings that read the transform. Never build a new context per frame.
 *
 * The coordinate math is `PageTransform` from `@embedpdf/core-geometry`, and the client-space
 * conversions are `pageClientSpace` from `@embedpdf/web`, both shared by every framework.
 */
import { inject, InjectionToken, type Signal } from '@angular/core';
import type { PageRef } from '@embedpdf/core';
import type { PageFrame, PageTransform, Point, Rect } from '@embedpdf/core-geometry';
import type { PageViewDemand } from '@embedpdf/plugin-render/contract';
import { pageClientSpace } from '@embedpdf/web';
import { outsidePageError } from './errors';

export interface EpdfPageContext {
  readonly documentId: string;
  /**
   * The page's address, the same for as long as the page is shown: use it for keys and calls.
   * An `<epdf-page-view>` whose `[page]` changes shows another page in the same context; its
   * `ref` and `documentId` are read through signals there, so a `computed()` or an `effect()`
   * that reads them follows.
   */
  readonly ref: PageRef;
  /** The page's place in the document, from 0. It moves when pages are reordered. */
  readonly pageIndex: Signal<number>;
  /** The bands reserved around the page for labels and buttons, in screen pixels per side. */
  readonly frame: Signal<PageFrame>;
  /**
   * Between PDF points, view pixels and device pixels on this page: `pageToViewRect` places
   * something on the page, `renderScale` and `deviceWidth` size a picture of it. Changes with
   * every camera frame.
   */
  readonly transform: Signal<PageTransform>;
  /**
   * Which view shows the page (a Stage's lens id). Per-view work, such as which tiles to draw,
   * is kept per view, so a thumbnail strip never disturbs the main view.
   */
  readonly view: string;
  /** A point on the screen (client pixels) to a point on the page: the one hit test. */
  toPagePoint(clientX: number, clientY: number): Point;
  /** A point on the page to client pixels: the exact inverse of `toPagePoint`. */
  toClientPoint(point: Point): Point;
  /** A box on the page to the client-pixel box around it. */
  toClientRect(rect: Rect): Rect;
  /**
   * How much of the page the view wants drawn, read when asked: a Stage gives the part on
   * screen (an empty rect when the page left the screen); a standalone page view gives none,
   * which means the whole page.
   */
  readonly getViewDemand?: () => PageViewDemand;
}

export const EPDF_PAGE = new InjectionToken<EpdfPageContext>('EPDF_PAGE');

/** The page this component is drawn on; EPDF-103, naming `what`, outside a page. */
export function injectPage(what = 'This component'): EpdfPageContext {
  const page = inject(EPDF_PAGE, { optional: true });
  if (!page) throw outsidePageError(what);
  return page;
}

/**
 * A page context from its parts. `documentId` and `ref` are functions because a component's
 * inputs aren't set yet when it's constructed; both stay the same for the page's lifetime.
 */
export function createPageContext(parts: {
  documentId: () => string;
  ref: () => PageRef;
  view: () => string;
  pageIndex: Signal<number>;
  frame: Signal<PageFrame>;
  transform: Signal<PageTransform>;
  /** The page's box on screen: the turned content box's bounding box. */
  getRect: () => DOMRect;
  getViewDemand?: () => PageViewDemand;
}): EpdfPageContext {
  const { transform, getRect } = parts;
  return {
    get documentId() {
      return parts.documentId();
    },
    get ref() {
      return parts.ref();
    },
    get view() {
      return parts.view();
    },
    pageIndex: parts.pageIndex,
    frame: parts.frame,
    transform,
    ...(parts.getViewDemand ? { getViewDemand: parts.getViewDemand } : {}),
    // Client pixels to pixels in the page's box, then the transform undoes the turn and the scale,
    // against the transform the signal holds when a conversion runs.
    ...pageClientSpace(transform, getRect),
  };
}
