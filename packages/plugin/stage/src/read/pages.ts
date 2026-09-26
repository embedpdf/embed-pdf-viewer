/**
 * The page reads: laid-out pages with their transforms (PDF points → view px
 * → device px), the scroller projection, the visible set (memoized so reads
 * stay reference-stable), coordinate conversions and the camera, zoom and
 * viewpoint reads.
 */
import {
  cameraWorldRect,
  scrollMetrics,
  toScreen,
  toWorld,
  type PageBox,
  type ScrollMetrics,
  type Size,
} from '@embedpdf/core-stage';
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
import { memo, toPageRef, type PluginContext, type PageRef } from '@embedpdf/core';

import type { Viewpoint, VisiblePage } from '../contract';
import type { StageHostCapability } from '../host-contract';
import type { StageState } from '../model';
import type { StageServices } from '../services';

export function createPageReads(
  ctx: PluginContext<StageState>,
  { scene }: Pick<StageServices, 'scene'>,
) {
  const {
    camera,
    viewport,
    dpr,
    padding,
    paged,
    buildScene,
    cacheKey,
    stayBounds,
    cursorItem,
    currentAnchor,
  } = scene;
  const state = () => ctx.state.get();

  // The durable identity of the page at a display index, from the registry.
  const pageObjectNumberAt = (index: number): number =>
    ctx.document()?.pages[index]?.ref.pageObjectNumber ?? index + 1;

  // The un-rotated point size of a laid-out box, for when the registry entry
  // is momentarily absent. `displaySize` is its own inverse (display box →
  // content box); dividing by contentScale recovers points.
  const unrotatedPoints = (box: PageBox): Size => {
    const content = displaySize({ width: box.width, height: box.height }, box.rotation);
    return { width: content.width / box.contentScale, height: content.height / box.contentScale };
  };

  // Attach durable identity and the per-page transform (PDF points → view px
  // → device px). `scale` is view px per point: contentScale (world per
  // point) × zoom (view px per world); `pageSize` is the page's un-rotated
  // points from the registry. The transform depends only on zoom, rotation,
  // contentScale and dpr, so the same box yields the same transform at any pan.
  const withTransform = (box: PageBox): VisiblePage => {
    const registered = ctx.document()?.pages[box.pageIndex];
    const pageSize = registered
      ? { width: registered.size.width, height: registered.size.height }
      : unrotatedPoints(box);
    const current = camera();
    const ratio = dpr();
    // The footprint's top-left, camera-resolved. Device-snapped at rest, which
    // keeps a rotated page on the device grid; while the zoom moves it places
    // fractionally (see `StageState.cameraResting`).
    const rawX = (box.x - current.x) * current.zoom;
    const rawY = (box.y - current.y) * current.zoom;
    const resting = state().cameraResting;
    const screenX = resting ? snapToDevice(rawX, ratio) : rawX;
    const screenY = resting ? snapToDevice(rawY, ratio) : rawY;
    const transform = pageTransform({
      pageSize,
      rotation: box.rotation,
      scale: box.contentScale * current.zoom,
      // The page's physical 100%: the platform unit factor × its /UserUnit,
      // so `transform.zoom` reads as "percent of Acrobat's 100%" per page,
      // independent of sizing mode or camera state.
      baseScale: state().viewUnitsPerPoint * (registered?.userUnit ?? 1),
      dpr: ratio,
    });
    // The on-screen page region in points: viewport ∩ footprint in view
    // space (both axis-aligned), inverted through the transform (exact for
    // quarter-turns). The virtualizer's query already decided this coarsely;
    // it is refined per page here, once, so no adapter re-derives camera math
    // (tiling's demand reads this field).
    const size = viewport();
    const onScreen = intersectRects(
      { x: -screenX, y: -screenY, width: size.width, height: size.height },
      { x: 0, y: 0, width: transform.viewWidth, height: transform.viewHeight },
    );
    const visibleRect =
      onScreen.width > 0 && onScreen.height > 0
        ? transform.viewToContentRect(onScreen)
        : { x: 0, y: 0, width: 0, height: 0 };
    return {
      ...box,
      ref: toPageRef(pageObjectNumberAt(box.pageIndex)),
      screenX,
      screenY,
      transform,
      visibleRect,
    };
  };

  // The scroller projection: the camera in native DOM vocabulary, against the
  // same bounds the pan clamp uses (stayBounds: the slice item in paged flow,
  // the scene in continuous). Memoized like the visible pages: the same
  // reference until a field moves, so adapter reads can use plain equality.
  const emptyScrollMetrics: ScrollMetrics = {
    scrollLeft: 0,
    scrollTop: 0,
    scrollWidth: 0,
    scrollHeight: 0,
    clientWidth: 0,
    clientHeight: 0,
    scrollableX: false,
    scrollableY: false,
  };
  let lastMetrics: ScrollMetrics | null = null;
  const scrollMetricsNow = (): ScrollMetrics => {
    if (!state().placed) return emptyScrollMetrics;
    const metrics = scrollMetrics(
      camera(),
      buildScene().itemCount ? stayBounds() : { x: 0, y: 0, width: 0, height: 0 },
      viewport(),
      padding(),
    );
    const previous = lastMetrics;
    if (
      previous &&
      previous.scrollLeft === metrics.scrollLeft &&
      previous.scrollTop === metrics.scrollTop &&
      previous.scrollWidth === metrics.scrollWidth &&
      previous.scrollHeight === metrics.scrollHeight &&
      previous.clientWidth === metrics.clientWidth &&
      previous.clientHeight === metrics.clientHeight
    ) {
      return previous; // scrollableX/Y derive from the six numbers
    }
    lastMetrics = metrics;
    return metrics;
  };

  // The visible pages, memoized on everything they depend on so the read is
  // reference-stable (no useSyncExternalStore tearing loop). Paged flow
  // renders only the slice's item; continuous flow renders the camera's
  // query window.
  const noVisiblePages: VisiblePage[] = [];
  const placedVisiblePages = memo(
    () => {
      const current = camera();
      const size = viewport();
      buildScene(); // keys the scene cache that `cacheKey` reads
      return [
        cacheKey(),
        state().flow,
        current.x,
        current.y,
        current.zoom,
        size.width,
        size.height,
        dpr(),
        state().cameraResting,
      ] as const;
    },
    (_sceneKey, _flow, x, y, zoom, width, height, _dpr, _resting): VisiblePage[] => {
      const scene = buildScene();
      const items = paged()
        ? scene.items.slice(0, 1)
        : scene.query(cameraWorldRect({ x, y, zoom }, { width, height }));
      return items.flatMap((item) => item.pages).map(withTransform);
    },
  );
  const visiblePages = (): VisiblePage[] =>
    state().placed ? placedVisiblePages() : noVisiblePages;

  const getPageFrame = (page: PageRef): VisiblePage | null => {
    if (!state().placed) return null;
    const index = ctx.getPage(page)?.index ?? -1;
    if (index < 0) return null;
    const scene = buildScene();
    if (!scene.itemCount) return null;
    const box = scene.items[scene.itemOfPage(index)].pages.find(
      (candidate) => candidate.pageIndex === index,
    );
    return box ? withTransform(box) : null;
  };

  const pageToWorld = (page: PageRef, point: Point): Point | null => {
    const frame = getPageFrame(page);
    if (!frame) return null;
    // Place the content point into the page's display box through the same
    // quarter-turn matrix the layout and renderer use (`rotateScaleMatrix`),
    // so this forward transform and the adapter's inverse hit-test cannot
    // drift. `displaySize` is its own inverse, so it recovers the un-rotated
    // content size from the display box.
    const content = displaySize({ width: frame.width, height: frame.height }, frame.rotation);
    const matrix = rotateScaleMatrix(
      frame.contentScale,
      content.width,
      content.height,
      frame.rotation,
    );
    const offset = applyPoint(matrix, point);
    return { x: frame.x + offset.x, y: frame.y + offset.y };
  };

  return {
    scrollMetricsNow,
    visiblePages,
    api: {
      getCamera: camera,
      getViewportSize: viewport,
      getScrollMetrics: scrollMetricsNow,
      listVisiblePages: visiblePages,
      isPageVisible: (page) =>
        visiblePages().some(
          (visiblePage) => visiblePage.ref.pageObjectNumber === page.pageObjectNumber,
        ),
      getCurrentPageIndex: () => state().cursor,
      getCurrentPage: () => ctx.document()?.pages[state().cursor] ?? null,
      listCurrentItemPages: () => {
        const item = cursorItem();
        const pages = ctx.document()?.pages ?? [];
        return item
          ? item.pageIndexes.map((index) => pages[index]).filter((page) => page !== undefined)
          : [];
      },
      getPageFrame,
      getPageAt: (point) => {
        // Find the visible page whose device-snapped display box contains the
        // point, then invert that page's transform: the same `viewToContent`
        // the per-page context's `toContentPoint` uses, so the two never drift.
        for (const page of visiblePages()) {
          const localX = point.x - page.screenX;
          const localY = point.y - page.screenY;
          if (
            localX >= 0 &&
            localY >= 0 &&
            localX <= page.transform.viewWidth &&
            localY <= page.transform.viewHeight
          ) {
            return {
              ref: page.ref,
              point: page.transform.viewToContent({ x: localX, y: localY }),
              scale: page.transform.viewScale,
              rotation: page.rotation,
              zoom: page.transform.zoom,
            };
          }
        }
        return null;
      },
      viewportToPage: (page, point) => {
        // `getPageAt` without the containment check: project onto one page's
        // plane, valid outside its bounds, through the same inverse transform.
        const target = visiblePages().find(
          (visiblePage) => visiblePage.ref.pageObjectNumber === page.pageObjectNumber,
        );
        if (!target) return null;
        return target.transform.viewToContent({
          x: point.x - target.screenX,
          y: point.y - target.screenY,
        });
      },
      pageToWorld,
      pageRectToViewport: (page, rect) => {
        const frame = getPageFrame(page);
        if (!frame) return null;
        const content = displaySize({ width: frame.width, height: frame.height }, frame.rotation);
        const matrix = rotateScaleMatrix(
          frame.contentScale,
          content.width,
          content.height,
          frame.rotation,
        );
        const world = applyRect(matrix, rect);
        const current = camera();
        const topLeft = toScreen(current, { x: frame.x + world.x, y: frame.y + world.y });
        return {
          x: topLeft.x,
          y: topLeft.y,
          width: world.width * current.zoom,
          height: world.height * current.zoom,
        };
      },
      worldToViewport: (world) => toScreen(camera(), world),
      viewportToWorld: (point) => toWorld(camera(), point),
      pageToViewport: (page, point) => {
        const world = pageToWorld(page, point);
        return world ? toScreen(camera(), world) : null;
      },
      getViewRotation: () => state().viewRotation,
      getZoomLevel: () => camera().zoom,
      getZoomMode: () => {
        const zoom = state().zoom;
        return 'mode' in zoom ? zoom.mode : 'custom';
      },
      getViewpoint: (): Viewpoint => ({ anchor: currentAnchor(), zoom: state().zoom }),
    } satisfies Partial<StageHostCapability>,
  };
}
export type StagePageReads = ReturnType<typeof createPageReads>;
