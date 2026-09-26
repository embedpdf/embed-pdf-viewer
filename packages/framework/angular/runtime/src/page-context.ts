/**
 * PageContext — the seam. A layer depends only on this, never on the Stage, so
 * the same layer works inside a virtualized `<epdf-stage>` page and a future
 * standalone `<epdf-page-view>`.
 *
 * The stability invariant (the one performance rule of this adapter): a page's
 * context is one stable object per mounted surface — identity never changes;
 * the volatile parts (`transform`, `frame`, `pageIndex`) are signals inside it.
 * The per-page injector providing `EPDF_PAGE` is likewise created once. Camera
 * frames then flow as signal writes — `NgTemplateOutlet` never recreates the
 * embedded views, in-flight renders survive, and updates stay per-binding.
 * Never rebuild the context or the injector per frame.
 *
 * Coordinate math lives in `@embedpdf/core-geometry`'s `PageTransform` — verified
 * once, not re-derived per framework adapter (`toContentPoint` mirrors React's
 * `makePageContext` exactly).
 */
import { InjectionToken, inject, type Signal } from '@angular/core';
import type { PageRef } from '@embedpdf/core';
import type { PageFrame, PageTransform, Point, Rect } from '@embedpdf/core-geometry';

export interface EpdfPageContext {
  readonly documentId: string;
  /** The page's durable address — use for keys / render / annotations (read
   *  `ref.pageObjectNumber` where a map key is needed). */
  readonly ref: PageRef;
  /** Display index (page N) — can shift under page reorders, hence a signal. */
  readonly pageIndex: Signal<number>;
  /** Reserved chrome bands around the page (screen px per side). */
  readonly frame: Signal<PageFrame>;
  /** The single bridge between PDF points, view px, and device px for this
   *  page. Layers do all coordinate work through it — never re-derive
   *  `x * scale` or `* dpr`. Updates per camera frame. */
  readonly transform: Signal<PageTransform>;
  /** Client (screen) point → the viewer's coordinates (content point) — the
   *  one platform-bound hit-test. */
  toContentPoint(clientX: number, clientY: number): Point;
  /** Content point → client (screen) px — the exact inverse of `toContentPoint`. */
  toClientPoint(point: Point): Point;
  /** Content rect → client (screen) px AABB. */
  toClientRect(rect: Rect): Rect;
}

export const EPDF_PAGE = new InjectionToken<EpdfPageContext>('EPDF_PAGE');

export function injectPage(): EpdfPageContext {
  const page = inject(EPDF_PAGE, { optional: true });
  if (!page) {
    throw new Error('[embedpdf] injectPage() must be used inside an <epdf-stage> page template');
  }
  return page;
}

/** Build a page context from its reactive parts. `documentId`/`ref` are thunks
 *  because inputs aren't readable at construction — both are stable per surface. */
export function createPageContext(parts: {
  documentId: () => string;
  ref: () => PageRef;
  pageIndex: Signal<number>;
  frame: Signal<PageFrame>;
  transform: Signal<PageTransform>;
  /** The rotated content wrapper's live bounding box (the page's display box). */
  getRect: () => DOMRect;
}): EpdfPageContext {
  const { transform, getRect } = parts;
  return {
    get documentId() {
      return parts.documentId();
    },
    get ref() {
      return parts.ref();
    },
    pageIndex: parts.pageIndex,
    frame: parts.frame,
    transform,
    toContentPoint: (clientX, clientY) => {
      // Client → box-local view px, then invert rotation + scale via the
      // transform (verified once in geometry, not re-derived per adapter).
      const rect = getRect();
      return transform().viewToContent({ x: clientX - rect.left, y: clientY - rect.top });
    },
    toClientPoint: (point) => {
      // Exact inverse of `toContentPoint`, offset by the same live display-box
      // origin — the two can never drift.
      const rect = getRect();
      const viewPoint = transform().contentToView(point);
      return { x: rect.left + viewPoint.x, y: rect.top + viewPoint.y };
    },
    toClientRect: (rect) => {
      const elementRect = getRect();
      const viewRect = transform().contentToViewRect(rect);
      return {
        x: elementRect.left + viewRect.x,
        y: elementRect.top + viewRect.y,
        width: viewRect.width,
        height: viewRect.height,
      };
    },
  };
}
