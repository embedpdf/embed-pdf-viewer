/**
 * The scene model: the document's item grouping, the layout, the memoized
 * scene (continuous flow lays out the whole document; paged flow a one-item
 * slice at the origin), and the pure geometry reads every area builds on:
 * fit, alignment points, clamp bounds and anchors. Reads only; nothing here
 * changes state.
 */
import {
  anchorFromCamera,
  gridLayout,
  groupPages,
  linearLayout,
  ZoomMode,
  type AlignmentValue,
  type AlignValue,
  type Anchor,
  type CameraConstraint,
  type PageFrame,
  type Point,
  type Rect as StageRect,
  type Scene,
  type SceneItem,
  type Size,
} from '@embedpdf/core-stage';
import { addRotations, applyRect, displaySize, rotateScaleMatrix } from '@embedpdf/core-geometry';
import type { Rect } from '@embedpdf/core-geometry';
import { memo, type PluginContext, type PageRef } from '@embedpdf/core';

import type { StageSettings } from '../contract';
import type { StageState } from '../model';
import { SETTINGS_EFFECT, SETTING_KEYS } from '../settings';

export function createScene(ctx: PluginContext<StageState>) {
  const state = () => ctx.state.get();
  const camera = () => state().camera;
  const viewport = () => state().viewport;
  const dpr = () => state().dpr;
  const padding = () => state().padding;
  const paged = () => state().flow === 'paged';
  const isFitAll = () => {
    const zoom = state().zoom;
    return 'mode' in zoom && zoom.mode === ZoomMode.FitAll;
  };

  // The document's item model (spread grouping) is independent of the
  // rendered scene, so navigation can reason about every item while a paged
  // scene holds only one. The cursor is a page; `itemIndexOfPage` maps it,
  // which survives regrouping.
  const grouping = memo(
    () => [ctx.document()?.pageCount ?? 0, state().spread] as const,
    (pageCount, spread): { grouping: number[][]; firstPages: number[] } => {
      const groups = groupPages(pageCount, spread);
      return { grouping: groups, firstPages: groups.map((item) => item[0]) };
    },
  );
  const itemCountFull = (): number => grouping().grouping.length;
  const itemIndexOfPage = (pageIndex: number): number => {
    const firstPages = grouping().firstPages;
    let low = 0;
    let high = firstPages.length;
    while (low < high) {
      const middle = (low + high) >> 1;
      if (firstPages[middle] <= pageIndex) low = middle + 1;
      else high = middle;
    }
    return Math.max(0, low - 1);
  };

  // The zoom that converts screen-px settings into world units. A fixed zoom
  // intent gives an exact, stable value (the thumbnail case); other intents
  // use the camera's current zoom, which `stabilized` converges. Screen-px
  // settings (the wrapped line width, pageFrame, `{ px }` gaps) are the only
  // way a scene depends on the viewport or the zoom.
  const effectiveZoom = (): number => {
    const zoom = state().zoom;
    return 'level' in zoom ? zoom.level : Math.max(state().camera.zoom, 0.0001);
  };

  // Wrapped grid: the line width (world units) the columns must fit.
  const wrapLineWidth = (): number =>
    Math.max(1, (viewport().width - 2 * padding()) / effectiveZoom());

  // pageFrame (screen px) → world units at the effective zoom.
  const worldPageFrame = (): PageFrame => {
    const frame = state().pageFrame;
    if (!frame.top && !frame.right && !frame.bottom && !frame.left) return frame;
    const zoom = effectiveZoom();
    return {
      top: frame.top / zoom,
      right: frame.right / zoom,
      bottom: frame.bottom / zoom,
      left: frame.left / zoom,
    };
  };
  const frameKey = (): string => {
    const frame = state().pageFrame;
    if (!frame.top && !frame.right && !frame.bottom && !frame.left) return '-';
    const world = worldPageFrame();
    return `${Math.round(world.top)},${Math.round(world.right)},${Math.round(world.bottom)},${Math.round(world.left)}`;
  };

  // gap → world units. A plain number is world units (the scene stays
  // zoom-invariant, the rigid-canvas default); `{ px }` converts at the
  // effective zoom like pageFrame (UI-stable spacing for browser-style lenses).
  const worldGap = (): number => {
    const gap = state().gap;
    return typeof gap === 'number' ? gap : gap.px ? gap.px / effectiveZoom() : 0;
  };
  const gapKey = (): string => {
    const gap = state().gap;
    return typeof gap === 'number' ? String(gap) : `px:${Math.round(worldGap())}`;
  };

  const layoutFor = (groups: number[][]): Scene => {
    const settings = state();
    // Engine page layouts structurally satisfy stage-core's page geometry
    // (`size` + `rotation`): the intrinsic page size flows straight in.
    //
    // The view rotation is composed here, and only here: each page's display
    // rotation is its /Rotate plus this lens's viewRotation. Everything
    // downstream (the display-size swap, the page transform, hit-testing, fit
    // zoom, overlays) reads the composed rotation. `size` stays the page's
    // own un-rotated points, so content space is view-rotation-invariant.
    const registryPages = ctx.document()?.pages ?? [];
    const viewRotation = settings.viewRotation;
    const pages =
      viewRotation === 0
        ? registryPages
        : registryPages.map((page) => ({
            ...page,
            rotation: addRotations(page.rotation, viewRotation),
          }));
    const pageFrame = worldPageFrame();
    const gap = worldGap();
    const viewUnitsPerPoint = settings.viewUnitsPerPoint;
    if (settings.layout === 'grid') {
      return gridLayout(pages, groups, {
        gap,
        sizing: settings.sizing,
        direction: settings.direction,
        pageFrame,
        viewUnitsPerPoint,
        columns: typeof settings.columns === 'number' ? settings.columns : undefined,
        lineWidth: settings.columns === 'auto' ? wrapLineWidth() : undefined,
      });
    }
    return linearLayout(pages, groups, {
      axis: settings.layout === 'horizontal' ? 'x' : 'y',
      gap,
      sizing: settings.sizing,
      direction: settings.direction,
      pageFrame,
      viewUnitsPerPoint,
    });
  };

  // The column policy's part of the scene key; 'auto' quantizes the line
  // width so sub-pixel resizes do not rebuild the scene.
  const columnsKey = (): string => {
    const settings = state();
    if (settings.layout !== 'grid') return '-';
    return settings.columns === 'auto'
      ? `auto:${Math.round(wrapLineWidth())}`
      : String(settings.columns);
  };

  // The scene's settings signature, derived from the settings registry: every
  // 'scene' setting contributes automatically, so a new layout-affecting
  // setting only needs its SETTINGS_EFFECT row and a stale scene cannot be
  // forgotten here. Values key by value (objects via JSON); the custom
  // functions quantize px-derived values so sub-pixel zoom and resize churn
  // does not rebuild the scene.
  const SCENE_KEY_FUNCTIONS: Partial<Record<keyof StageSettings, () => string>> = {
    columns: columnsKey,
    gap: gapKey,
    pageFrame: frameKey,
  };
  const SCENE_KEYS = SETTING_KEYS.filter((key) => SETTINGS_EFFECT[key] === 'scene');
  const settingsKey = (): string =>
    SCENE_KEYS.map((key) => {
      const keyFunction = SCENE_KEY_FUNCTIONS[key];
      if (keyFunction) return keyFunction();
      const value = state()[key];
      return typeof value === 'object' && value !== null ? JSON.stringify(value) : String(value);
    }).join('|');

  // The scene cache. Continuous flow lays out the whole document. Paged flow
  // is a one-item slice at the origin holding only the cursor's item, so
  // isolation is structural (no other page exists to leak into view),
  // unbounded pan is free, and coordinates stay local.
  let sceneCache: { key: string; scene: Scene } | null = null;
  // The registry signature: page count plus the kernel's monotonic
  // `revision`. The revision changes on every page mutation (rotate, move,
  // delete), so a change that keeps the page count (a rotation) still re-keys
  // the scene instead of rendering the page in its stale box.
  const documentKey = (): string => {
    const document = ctx.document();
    return document ? `${document.pageCount}.${document.revision}` : '0.0';
  };
  const buildScene = (): Scene => {
    const { grouping: groups } = grouping();
    if (state().flow === 'paged') {
      const index = groups.length
        ? Math.min(itemIndexOfPage(state().cursor), groups.length - 1)
        : 0;
      const key = `paged|${documentKey()}|${settingsKey()}|${index}`;
      if (sceneCache && sceneCache.key === key) return sceneCache.scene;
      const scene = layoutFor(groups.length ? [groups[index]] : []);
      sceneCache = { key, scene };
      return scene;
    }
    const key = `continuous|${documentKey()}|${settingsKey()}`;
    if (sceneCache && sceneCache.key === key) return sceneCache.scene;
    const scene = layoutFor(groups);
    sceneCache = { key, scene };
    return scene;
  };
  /** Drop the memoized scene (a 'scene' or 'reflow' setting changed, or a view was restored). */
  const invalidate = (): void => {
    sceneCache = null;
  };
  /** The current scene's cache key, part of the visible-pages signature. */
  const cacheKey = (): string => sceneCache!.key;

  // ── geometry helpers ──
  const sceneRect = (): StageRect => {
    const { width, height } = buildScene().size;
    return { x: 0, y: 0, width, height };
  };
  const itemRect = (item: SceneItem): StageRect => ({
    x: item.x,
    y: item.y,
    width: item.width,
    height: item.height,
  });
  const pageRectOf = (item: SceneItem, pageIndex: number): StageRect => {
    const box = item.pages.find((page) => page.pageIndex === pageIndex) ?? item.pages[0];
    return { x: box.x, y: box.y, width: box.width, height: box.height };
  };
  /** The item shown for the cursor: the slice's only item (paged) or the full-scene item. */
  const cursorItem = (): SceneItem => {
    const scene = buildScene();
    return paged() ? scene.items[0] : scene.items[itemIndexOfPage(state().cursor)];
  };

  /**
   * A content-space rect on a page → a world rect: the same quarter-turn
   * matrix `pageRectToViewport` uses, minus the camera, so a positioned
   * reveal and the rendered overlay never disagree about where a rect is.
   */
  const worldRectForContent = (item: SceneItem, pageIndex: number, rect: Rect): StageRect => {
    const box = item.pages.find((page) => page.pageIndex === pageIndex) ?? item.pages[0];
    const content = displaySize({ width: box.width, height: box.height }, box.rotation);
    const matrix = rotateScaleMatrix(box.contentScale, content.width, content.height, box.rotation);
    const world = applyRect(matrix, rect);
    return { x: box.x + world.x, y: box.y + world.y, width: world.width, height: world.height };
  };

  // Does this rect fit the padded viewport at this zoom? It decides the
  // navigation step size and the arrival subject, never the alignment.
  const fits = (rect: StageRect, zoom: number): boolean => {
    const size = viewport();
    const inset = padding();
    const tolerance = 0.5;
    return (
      rect.width * zoom <= size.width - 2 * inset + tolerance &&
      rect.height * zoom <= size.height - 2 * inset + tolerance
    );
  };
  // An alignment policy → a concrete viewport point: a fraction per axis
  // (start = 0, center = ½, end = 1; named x stops are logical under RTL).
  // zoomAlign and anchorAlign both resolve through this. The fraction spans
  // the padded range: 'start' is the first visible content line just inside
  // the gutter, where an arrival puts the page edge, so the reference pins
  // to the page and never to the gap above it.
  const alignFraction = (value: AlignValue): number =>
    value === 'start'
      ? 0
      : value === 'center'
        ? 0.5
        : value === 'end'
          ? 1
          : Math.min(1, Math.max(0, value));
  const alignPoint = (alignment: AlignmentValue, size: Size): Point => {
    const rtl = state().direction === 'rtl';
    const alignX =
      rtl && alignment.x === 'start' ? 'end' : rtl && alignment.x === 'end' ? 'start' : alignment.x;
    const inset = padding();
    return {
      x: inset + (size.width - 2 * inset) * alignFraction(alignX),
      y: inset + (size.height - 2 * inset) * alignFraction(alignment.y),
    };
  };
  const anchorPoint = (): Point => alignPoint(state().anchorAlign, viewport());

  /** The box the zoom intent fits: the whole scene (fit-all), the current
   *  item (paged: per-page fit), or the document maximum (continuous: a
   *  document-stable zoom). */
  const fitBox = (item: SceneItem): Size => {
    if (isFitAll()) return buildScene().size;
    return paged() ? { width: item.width, height: item.height } : buildScene().maxItemSize;
  };
  /** The clamp rect for a camera write targeting this item (the scene in continuous flow). */
  const boundsFor = (item: SceneItem): StageRect => (paged() ? itemRect(item) : sceneRect());
  /** The clamp rect for a write that stays put (pan, zoom): the slice item (paged) or the scene. */
  const stayBounds = (): StageRect => (paged() ? itemRect(buildScene().items[0]) : sceneRect());

  const constraint = (): CameraConstraint => ({
    bounded: state().bounded,
    padding: padding(),
    fitAlign: state().fitAlign,
    direction: state().direction,
  });

  const anchorAt = (at: Point): Anchor => {
    const scene = buildScene();
    return scene.itemCount
      ? anchorFromCamera(camera(), scene, viewport(), at)
      : { pageIndex: state().cursor, fx: 0.5, fy: 0 };
  };
  const currentAnchor = (): Anchor => anchorAt(anchorPoint());

  const indexOfPage = (page: PageRef): number => ctx.getPage(page)?.index ?? -1;

  return {
    camera,
    viewport,
    dpr,
    padding,
    paged,
    isFitAll,
    grouping,
    itemCountFull,
    itemIndexOfPage,
    worldPageFrame,
    buildScene,
    invalidate,
    cacheKey,
    sceneRect,
    itemRect,
    pageRectOf,
    cursorItem,
    worldRectForContent,
    fits,
    alignPoint,
    anchorPoint,
    fitBox,
    boundsFor,
    stayBounds,
    constraint,
    anchorAt,
    currentAnchor,
    indexOfPage,
  };
}
export type StageScene = ReturnType<typeof createScene>;
