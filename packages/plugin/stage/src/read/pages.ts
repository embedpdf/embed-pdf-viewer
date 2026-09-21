/**
 * The page reads: laid-out pages with their transforms (PDF points → view px
 * → device px), the scroller projection, the visible set (memoized so
 * selectors stay reference-stable), coordinate conversions and the camera /
 * zoom / viewpoint reads.
 */
import * as S from '@embedpdf/core-stage';
import {
  applyPoint,
  applyRect,
  displaySize,
  intersectRects,
  pageTransform,
  rotateScaleMatrix,
  snapToDevice,
} from '@embedpdf/core-geometry';
import type { Point } from '@embedpdf/core-geometry';
import { toPageRef, type PageRef } from '@embedpdf/core';

import type { Viewpoint, VisiblePage } from '../contract';
import type { StageHostCapability } from '../host-contract';
import type { StageContext, StageServices } from '../services';

export function createPageReads(ctx: StageContext, { scene }: Pick<StageServices, 'scene'>) {
  const { cam, vp, dpr, pad, paged, buildScene, cacheKey, stayBounds, cursorItem, currentAnchor } =
    scene;

  // pon (durable identity) for a page's display index, from the registry captured at open.
  const ponForIndex = (index: number): number =>
    ctx.document()?.pages[index]?.ref.pageObjectNumber ?? index + 1;

  // Fallback un-rotated point size from a laid-out box, when the registry entry is
  // momentarily absent. `displaySize` is its own inverse (display box → content
  // box); ÷ contentScale recovers points.
  const unrotatedPoints = (box: S.PageBox): S.Size => {
    const content = displaySize({ width: box.width, height: box.height }, box.rotation);
    return { width: content.width / box.contentScale, height: content.height / box.contentScale };
  };

  // Attach durable identity + the per-page transform (PDF points → view px →
  // device px). `scale` is view px per point = contentScale (world per point) ×
  // zoom (view px per world); `pageSize` is the page's UN-rotated points from the
  // registry. Camera-invariant (only zoom/rotation/contentScale/dpr), so the same
  // box always yields the same transform regardless of pan.
  const withTransform = (box: S.PageBox): VisiblePage => {
    const reg = ctx.document()?.pages[box.pageIndex];
    const pageSize = reg
      ? { width: reg.size.width, height: reg.size.height }
      : unrotatedPoints(box);
    const c = cam();
    const ratio = dpr();
    // Footprint top-left (camera-resolved). Device-snapped AT REST — keeps a
    // rotated page on the device grid; while the zoom is in motion it places
    // fractionally, because snapping mid-zoom makes the anchor point jitter
    // ±0.5 device px per step (see StageState.cameraResting).
    const rawX = (box.x - c.x) * c.zoom;
    const rawY = (box.y - c.y) * c.zoom;
    const resting = ctx.getState().cameraResting;
    const screenX = resting ? snapToDevice(rawX, ratio) : rawX;
    const screenY = resting ? snapToDevice(rawY, ratio) : rawY;
    const transform = pageTransform({
      pageSize,
      rotation: box.rotation,
      scale: box.contentScale * c.zoom,
      // The page's PHYSICAL 100%: platform unit factor × its /UserUnit — so
      // `transform.zoom` reads as "percent of Acrobat's 100%" per page,
      // independent of sizing mode or camera state.
      baseScale: ctx.getState().viewUnitsPerPoint * (reg?.userUnit ?? 1),
      dpr: ratio,
    });
    // The on-screen page region in points: viewport ∩ footprint in VIEW space
    // (both axis-aligned), inverted through the transform (exact for
    // quarter-turns). The same intersection the virtualizer's query already
    // decided coarsely — refined per page, once, HERE, so no adapter ever
    // re-derives camera math (tiling's demand reads this field).
    const v = vp();
    const onScreen = intersectRects(
      { x: -screenX, y: -screenY, width: v.width, height: v.height },
      { x: 0, y: 0, width: transform.viewWidth, height: transform.viewHeight },
    );
    const visibleRect =
      onScreen.width > 0 && onScreen.height > 0
        ? transform.viewToContentRect(onScreen)
        : { x: 0, y: 0, width: 0, height: 0 };
    return {
      ...box,
      ref: toPageRef(ponForIndex(box.pageIndex)),
      screenX,
      screenY,
      transform,
      visibleRect,
    };
  };

  // The scroller projection — the camera in native DOM vocabulary, against the
  // SAME bounds the pan clamp uses (stayBounds: the slice item in paged flow,
  // the scene in continuous). Memoized like visiblePages: a stable reference
  // until a field actually moves, so adapter selectors can use plain equality.
  const EMPTY_SCROLL_METRICS: S.ScrollMetrics = {
    scrollLeft: 0,
    scrollTop: 0,
    scrollWidth: 0,
    scrollHeight: 0,
    clientWidth: 0,
    clientHeight: 0,
    scrollableX: false,
    scrollableY: false,
  };
  let scrollMemo: S.ScrollMetrics | null = null;
  const scrollMetricsNow = (): S.ScrollMetrics => {
    if (!ctx.getState().placed) return EMPTY_SCROLL_METRICS;
    const sc = buildScene();
    const m = S.scrollMetrics(
      cam(),
      sc.itemCount ? stayBounds() : { x: 0, y: 0, width: 0, height: 0 },
      vp(),
      pad(),
    );
    const p = scrollMemo;
    if (
      p &&
      p.scrollLeft === m.scrollLeft &&
      p.scrollTop === m.scrollTop &&
      p.scrollWidth === m.scrollWidth &&
      p.scrollHeight === m.scrollHeight &&
      p.clientWidth === m.clientWidth &&
      p.clientHeight === m.clientHeight
    ) {
      return p; // scrollableX/Y derive from the numbers — covered by the six
    }
    scrollMemo = m;
    return m;
  };

  // Memoized visiblePages -> stable reference (no useSyncExternalStore tearing loop).
  // Paged renders ONLY the slice's item; continuous renders the camera's query window.
  const EMPTY_VISIBLE_PAGES: VisiblePage[] = [];
  let visSig = '';
  let vis: VisiblePage[] = [];
  const visiblePages = (): VisiblePage[] => {
    if (!ctx.getState().placed) return EMPTY_VISIBLE_PAGES;
    const c = cam();
    const v = vp();
    const sc = buildScene();
    const items = paged() ? sc.items.slice(0, 1) : sc.query(S.cameraWorldRect(c, v));
    const sig = `${cacheKey()}|${ctx.getState().flow}|${c.x},${c.y},${c.zoom}|${v.width}x${v.height}|${dpr()}|r${ctx.getState().cameraResting ? 1 : 0}`;
    if (sig === visSig) return vis;
    visSig = sig;
    vis = items.flatMap((it) => it.pages).map(withTransform);
    return vis;
  };

  const getPageFrame = (page: PageRef): VisiblePage | null => {
    if (!ctx.getState().placed) return null;
    const meta = ctx.document();
    const pon = page.pageObjectNumber;
    const index = meta ? meta.pages.findIndex((p) => p.ref.pageObjectNumber === pon) : -1;
    if (index < 0) return null;
    const sc = buildScene();
    if (!sc.itemCount) return null;
    const box = sc.items[sc.itemOfPage(index)].pages.find((p) => p.pageIndex === index);
    return box ? withTransform(box) : null;
  };

  const pageToWorld = (page: PageRef, pt: Point): Point | null => {
    const pr = getPageFrame(page);
    if (!pr) return null;
    // Place the content point into the page's display box via the SAME
    // quarter-turn matrix the layout/renderer use (`rotateScaleMatrix`) — so
    // this forward transform and the adapter's inverse hit-test (which inverts
    // the same matrix) can't drift. `displaySize` is its own inverse, so it
    // recovers the un-rotated content size from the display box.
    const content = displaySize({ width: pr.width, height: pr.height }, pr.rotation);
    const m = rotateScaleMatrix(pr.contentScale, content.width, content.height, pr.rotation);
    const offset = applyPoint(m, pt);
    return { x: pr.x + offset.x, y: pr.y + offset.y };
  };

  return {
    scrollMetricsNow,
    visiblePages,
    api: {
      getCamera: cam,
      getViewportSize: vp,
      getScrollMetrics: scrollMetricsNow,
      listVisiblePages: visiblePages,
      isPageVisible: (page) =>
        visiblePages().some((p) => p.ref.pageObjectNumber === page.pageObjectNumber),
      getCurrentPageIndex: () => ctx.getState().cursor,
      getCurrentPage: () => ctx.document()?.pages[ctx.getState().cursor] ?? null,
      listCurrentItemPages: () => {
        const item = cursorItem();
        const pages = ctx.document()?.pages ?? [];
        return item ? item.pageIndexes.map((i) => pages[i]).filter((p) => p !== undefined) : [];
      },
      getPageFrame,
      getPageAt: (screen) => {
        // Find the visible page whose device-snapped display box contains the
        // point, then invert that page's transform — same `viewToContent` the
        // per-page PageContext.toContentPoint uses, so the two never drift.
        for (const p of visiblePages()) {
          const lx = screen.x - p.screenX;
          const ly = screen.y - p.screenY;
          if (lx >= 0 && ly >= 0 && lx <= p.transform.viewWidth && ly <= p.transform.viewHeight) {
            return {
              ref: p.ref,
              point: p.transform.viewToContent({ x: lx, y: ly }),
              scale: p.transform.viewScale,
              rotation: p.rotation,
              zoom: p.transform.zoom,
            };
          }
        }
        return null;
      },
      viewportToPage: (page, screen) => {
        // `pageAt` minus the containment check: project onto ONE page's plane,
        // valid outside its bounds — the same inverse transform, so no drift.
        const p = visiblePages().find((v) => v.ref.pageObjectNumber === page.pageObjectNumber);
        if (!p) return null;
        return p.transform.viewToContent({ x: screen.x - p.screenX, y: screen.y - p.screenY });
      },
      pageToWorld,
      pageRectToViewport: (page, rect) => {
        const pr = getPageFrame(page);
        if (!pr) return null;
        const content = displaySize({ width: pr.width, height: pr.height }, pr.rotation);
        const m = rotateScaleMatrix(pr.contentScale, content.width, content.height, pr.rotation);
        const wr = applyRect(m, rect);
        const c = cam();
        const tl = S.toScreen(c, { x: pr.x + wr.x, y: pr.y + wr.y });
        return { x: tl.x, y: tl.y, width: wr.width * c.zoom, height: wr.height * c.zoom };
      },
      worldToViewport: (w) => S.toScreen(cam(), w),
      viewportToWorld: (s) => S.toWorld(cam(), s),
      pageToViewport: (page, pt) => {
        const world = pageToWorld(page, pt);
        return world ? S.toScreen(cam(), world) : null;
      },
      getViewRotation: () => ctx.getState().viewRotation,
      getZoomLevel: () => cam().zoom,
      getZoomMode: () => {
        const z = ctx.getState().zoom;
        return 'mode' in z ? z.mode : 'custom';
      },
      getViewpoint: (): Viewpoint => ({ anchor: currentAnchor(), zoom: ctx.getState().zoom }),
    } satisfies Partial<StageHostCapability>,
  };
}
export type StagePageReads = ReturnType<typeof createPageReads>;
