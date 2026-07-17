/**
 * PageContext — the seam. A layer depends ONLY on this, never on the Stage, so
 * the same layer works inside a virtualized `<epdf-stage>` page and a future
 * standalone `<epdf-page-view>`.
 *
 * THE STABILITY INVARIANT (the one performance rule of this adapter): a page's
 * context is ONE STABLE OBJECT per mounted surface — identity never changes;
 * the volatile parts (`transform`, `frame`, `pageIndex`) are signals INSIDE it.
 * The per-page injector providing `EPDF_PAGE` is likewise created once. Camera
 * frames then flow as signal writes — `NgTemplateOutlet` never recreates the
 * embedded views, in-flight renders survive, and updates stay per-binding.
 * Never rebuild the context or the injector per frame.
 *
 * Coordinate math lives in `@embedpdf-x/geometry`'s `PageTransform` — verified
 * once, not re-derived per framework adapter (`toPagePoint` mirrors React's
 * `makePageContext` exactly).
 */
import { InjectionToken, inject, type Signal } from '@angular/core';
import type { PageFrame, PageTransform, Point, Rect } from '@embedpdf-x/geometry';

export interface EpdfPageContext {
  readonly documentId: string;
  /** Durable page identity (PDF object number) — use for keys / render / annotations. */
  readonly pon: number;
  /** Display index (page N) — can shift under page reorders, hence a signal. */
  readonly pageIndex: Signal<number>;
  /** Reserved chrome bands around the page (screen px per side). */
  readonly frame: Signal<PageFrame>;
  /** The single bridge between PDF points, view px, and device px for this
   *  page. Layers do ALL coordinate work through it — never re-derive
   *  `x * scale` or `* dpr`. Updates per camera frame. */
  readonly transform: Signal<PageTransform>;
  /** Client (screen) point → PDF point — the one platform-bound hit-test. */
  toPagePoint(clientX: number, clientY: number): Point;
  /** PDF/content point → client (screen) px — the exact inverse of `toPagePoint`. */
  toClientPoint(p: Point): Point;
  /** PDF/content rect → client (screen) px AABB. */
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

/** Build a page context from its reactive parts. `documentId`/`pon` are thunks
 *  because inputs aren't readable at construction — both are stable per surface. */
export function createPageContext(parts: {
  documentId: () => string;
  pon: () => number;
  pageIndex: Signal<number>;
  frame: Signal<PageFrame>;
  transform: Signal<PageTransform>;
  /** The rotated content wrapper's LIVE bounding box (the page's display box). */
  getRect: () => DOMRect;
}): EpdfPageContext {
  const { transform, getRect } = parts;
  return {
    get documentId() {
      return parts.documentId();
    },
    get pon() {
      return parts.pon();
    },
    pageIndex: parts.pageIndex,
    frame: parts.frame,
    transform,
    toPagePoint: (clientX, clientY) => {
      // Client → box-local view px, then invert rotation + scale via the
      // transform (verified once in geometry, not re-derived per adapter).
      const r = getRect();
      return transform().viewToPage({ x: clientX - r.left, y: clientY - r.top });
    },
    toClientPoint: (p) => {
      // Exact inverse of `toPagePoint`, offset by the same live display-box
      // origin — the two can never drift.
      const r = getRect();
      const v = transform().pageToView(p);
      return { x: r.left + v.x, y: r.top + v.y };
    },
    toClientRect: (rect) => {
      const r = getRect();
      const v = transform().pageToViewRect(rect);
      return { x: r.left + v.x, y: r.top + v.y, width: v.width, height: v.height };
    },
  };
}
