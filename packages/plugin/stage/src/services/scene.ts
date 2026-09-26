/**
 * The scene model: the document's item grouping, the layout, the memoized
 * scene (continuous = the whole document; paged = a one-item slice at the
 * origin), and the pure geometry reads every area builds on — fit, alignment
 * points, clamp bounds, anchors. Reads only; nothing here dispatches.
 */
import * as S from '@embedpdf/core-stage';
import { addRotations, applyRect, displaySize, rotateScaleMatrix } from '@embedpdf/core-geometry';
import type { Rect } from '@embedpdf/core-geometry';
import type { PageRef } from '@embedpdf/core';

import type { StageSettings } from '../contract';
import { SETTINGS_EFFECT, SETTING_KEYS } from '../settings';
import type { StageContext } from './context';

export function createScene(ctx: StageContext) {
  const cam = () => ctx.getState().camera;
  const vp = () => ctx.getState().vp;
  const dpr = () => ctx.getState().dpr;
  const pad = () => ctx.getState().padding;
  const paged = () => ctx.getState().flow === 'paged';
  const isFitAll = () => {
    const z = ctx.getState().zoom;
    return 'mode' in z && z.mode === S.ZoomMode.FitAll;
  };

  // ── the document's item model (spread grouping) — independent of the rendered
  //    scene, so navigation can reason about ALL items while a paged SCENE holds
  //    only one. The cursor is a page; itemIndexOfPage maps it (survives regrouping).
  let groupingCache: { key: string; grouping: number[][]; firstPages: number[] } | null = null;
  const grouping = (): { grouping: number[][]; firstPages: number[] } => {
    const doc = ctx.document();
    const st = ctx.getState();
    const key = `${doc ? doc.pageCount : 0}|${st.spread}`;
    if (groupingCache && groupingCache.key === key) return groupingCache;
    const g = S.groupPages(doc ? doc.pageCount : 0, st.spread);
    groupingCache = { key, grouping: g, firstPages: g.map((item) => item[0]) };
    return groupingCache;
  };
  const itemCountFull = (): number => grouping().grouping.length;
  const itemIndexOfPage = (pageIndex: number): number => {
    const fp = grouping().firstPages;
    let lo = 0;
    let hi = fp.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (fp[mid] <= pageIndex) lo = mid + 1;
      else hi = mid;
    }
    return Math.max(0, lo - 1);
  };

  // The effective zoom for converting SCREEN px settings into world units — a
  // fixed zoom intent gives an exact, stable value (the thumbnail case); other
  // intents fall back to the camera's current zoom (`stabilized` converges it).
  // Screen-px settings (wrapped lineWidth, pageFrame) are the ONLY way a scene
  // depends on the viewport/zoom.
  const effectiveZoom = (): number => {
    const z = ctx.getState().zoom;
    return 'level' in z ? z.level : Math.max(ctx.getState().camera.zoom, 0.0001);
  };

  // Wrapped grid: the line width (world units) the columns must fit.
  const wrapLineWidth = (): number => Math.max(1, (vp().width - 2 * pad()) / effectiveZoom());

  // pageFrame (screen px) → world units at the effective zoom.
  const worldPageFrame = (): S.PageFrame => {
    const m = ctx.getState().pageFrame;
    if (!m.top && !m.right && !m.bottom && !m.left) return m;
    const ez = effectiveZoom();
    return { top: m.top / ez, right: m.right / ez, bottom: m.bottom / ez, left: m.left / ez };
  };
  const frameKey = (): string => {
    const m = ctx.getState().pageFrame;
    if (!m.top && !m.right && !m.bottom && !m.left) return '-';
    const w = worldPageFrame();
    return `${Math.round(w.top)},${Math.round(w.right)},${Math.round(w.bottom)},${Math.round(w.left)}`;
  };

  // gap → world units. A plain number IS world (the scene stays zoom-invariant —
  // the rigid-canvas default); { px } converts at the effective zoom, exactly
  // like pageFrame (UI-stable spacing for browser-style lenses).
  const worldGap = (): number => {
    const g = ctx.getState().gap;
    return typeof g === 'number' ? g : g.px ? g.px / effectiveZoom() : 0;
  };
  const gapKey = (): string => {
    const g = ctx.getState().gap;
    return typeof g === 'number' ? String(g) : `px:${Math.round(worldGap())}`;
  };

  const layoutFor = (groups: number[][]): S.Scene => {
    const st = ctx.getState();
    // Engine PageLayout (PDF document geometry) structurally satisfies stage-core's
    // viewer-local PageGeom (`size` + `rotation`): intrinsic page size needs no
    // transform, so it flows straight into the layout with no conversion.
    //
    // THE view-rotation injection point: each page's display rotation is its
    // /Rotate + this lens's viewRotation, composed HERE — the one spot where
    // the "TOTAL = document /Rotate + view rotation" of geometry's PageRotation
    // doc is resolved. Everything downstream (displaySize w↔h swap, the page
    // transform + CSS rotate, hit-testing, fit zoom, content overlays) reads the
    // composed `PageBox.rotation` and needs no other change. `size` stays the
    // page's own un-rotated points, so content space is view-rotation-invariant.
    const raw = ctx.document()?.pages ?? [];
    const vr = st.viewRotation;
    const pages =
      vr === 0 ? raw : raw.map((p) => ({ ...p, rotation: addRotations(p.rotation, vr) }));
    const pageFrame = worldPageFrame();
    const gap = worldGap();
    const vupp = st.viewUnitsPerPoint;
    if (st.layout === 'grid') {
      return S.gridLayout(pages, groups, {
        gap,
        sizing: st.sizing,
        direction: st.direction,
        pageFrame,
        viewUnitsPerPoint: vupp,
        columns: typeof st.columns === 'number' ? st.columns : undefined,
        lineWidth: st.columns === 'auto' ? wrapLineWidth() : undefined,
      });
    }
    return st.layout === 'horizontal'
      ? S.linearLayout(pages, groups, {
          axis: 'x',
          gap,
          sizing: st.sizing,
          direction: st.direction,
          pageFrame,
          viewUnitsPerPoint: vupp,
        })
      : S.linearLayout(pages, groups, {
          axis: 'y',
          gap,
          sizing: st.sizing,
          direction: st.direction,
          pageFrame,
          viewUnitsPerPoint: vupp,
        });
  };

  // Scene-cache key fragment for the column policy ('auto' quantizes the line width
  // so sub-pixel resizes don't churn the cache).
  const columnsKey = (): string => {
    const st = ctx.getState();
    if (st.layout !== 'grid') return '-';
    return st.columns === 'auto' ? `auto:${Math.round(wrapLineWidth())}` : String(st.columns);
  };

  // The scene's settings signature — DERIVED from the registry: every 'scene'
  // setting contributes automatically, so a new layout-affecting setting only
  // needs its SETTINGS_EFFECT row — it can't be forgotten here, which is what
  // makes stale-scene bugs unrepresentable. The default keys by VALUE (objects
  // via JSON); the custom fns aren't for correctness, they QUANTIZE px-derived
  // values so sub-pixel zoom/resize churn doesn't rebuild the scene.
  const SCENE_KEY_FNS: Partial<Record<keyof StageSettings, () => string>> = {
    columns: columnsKey,
    gap: gapKey,
    pageFrame: frameKey,
  };
  const SCENE_KEYS = SETTING_KEYS.filter((k) => SETTINGS_EFFECT[k] === 'scene');
  const settingsKey = (): string =>
    SCENE_KEYS.map((k) => {
      const fn = SCENE_KEY_FNS[k];
      if (fn) return fn();
      const v = ctx.getState()[k];
      return typeof v === 'object' && v !== null ? JSON.stringify(v) : String(v);
    }).join('|');

  // Scene cache. Continuous = the whole document. Paged = a ONE-ITEM SLICE at the
  // origin containing only the cursor's item — so isolation is STRUCTURAL (no other
  // page exists to leak), unbounded pan is free, and coordinates stay local.
  let sceneCache: { key: string; scene: S.Scene } | null = null;
  // Registry signature: page count + the kernel's monotonic `revision`. The
  // revision bumps on every page-mutation event (rotate/move/delete), so a
  // change that leaves pageCount the same — a rotation — still re-keys the
  // scene. Without it a rotated page would render in its stale box.
  const docKey = (): string => {
    const doc = ctx.document();
    return doc ? `${doc.pageCount}.${doc.revision}` : '0.0';
  };
  const buildScene = (): S.Scene => {
    const st = ctx.getState();
    const { grouping: g } = grouping();
    if (st.flow === 'paged') {
      const idx = g.length ? Math.min(itemIndexOfPage(st.cursor), g.length - 1) : 0;
      const key = `paged|${docKey()}|${settingsKey()}|${idx}`;
      if (sceneCache && sceneCache.key === key) return sceneCache.scene;
      const scene = layoutFor(g.length ? [g[idx]] : []);
      sceneCache = { key, scene };
      return scene;
    }
    const key = `cont|${docKey()}|${settingsKey()}`;
    if (sceneCache && sceneCache.key === key) return sceneCache.scene;
    const scene = layoutFor(g);
    sceneCache = { key, scene };
    return scene;
  };
  /** Drop the memoized scene (a 'scene'/'reflow' setting changed or a view was restored). */
  const invalidate = (): void => {
    sceneCache = null;
  };
  /** The current scene's cache key — part of the visible-pages signature. */
  const cacheKey = (): string => sceneCache!.key;

  // ── geometry helpers ──────────────────────────────────────────────────────────
  const sceneRect = (): S.Rect => {
    const { width, height } = buildScene().size;
    return { x: 0, y: 0, width, height };
  };
  const itemRect = (it: S.SceneItem): S.Rect => ({
    x: it.x,
    y: it.y,
    width: it.width,
    height: it.height,
  });
  const pageRectOf = (it: S.SceneItem, pageIndex: number): S.Rect => {
    const box = it.pages.find((p) => p.pageIndex === pageIndex) ?? it.pages[0];
    return { x: box.x, y: box.y, width: box.width, height: box.height };
  };
  /** The item shown for the cursor: the slice's only item (paged) / the full-scene item. */
  const cursorItem = (): S.SceneItem => {
    const sc = buildScene();
    return paged() ? sc.items[0] : sc.items[itemIndexOfPage(ctx.getState().cursor)];
  };

  /**
   * CONTENT-space rect on a page → WORLD rect: the same quarter-turn matrix
   * `pageRectToScreen` uses, minus the camera — so a positioned reveal and
   * the rendered overlay can never disagree about where a rect is.
   */
  const worldRectForContent = (it: S.SceneItem, pageIndex: number, rect: Rect): S.Rect => {
    const box = it.pages.find((p) => p.pageIndex === pageIndex) ?? it.pages[0];
    const content = displaySize({ width: box.width, height: box.height }, box.rotation);
    const m = rotateScaleMatrix(box.contentScale, content.width, content.height, box.rotation);
    const wr = applyRect(m, rect);
    return { x: box.x + wr.x, y: box.y + wr.y, width: wr.width, height: wr.height };
  };

  // THE predicate. "Does this rect fit the padded viewport at this zoom?" decides
  // the navigation step size and the arrival subject — never alignment.
  const fits = (rect: S.Rect, zoom: number): boolean => {
    const v = vp();
    const p = pad();
    const eps = 0.5;
    return (
      rect.width * zoom <= v.width - 2 * p + eps && rect.height * zoom <= v.height - 2 * p + eps
    );
  };
  // An alignment policy → a concrete viewport point (a fraction per axis:
  // start=0, center=½, end=1; named x stops are LOGICAL under RTL). Both
  // zoomAlign (the focal point of pointer-less zooms) and anchorAlign (the
  // reframe reference point) resolve through this. The fraction interpolates
  // the PADDED range: 'start' is the first visible content line (just inside
  // the gutter), not the absolute corner — an arrival puts the page edge
  // exactly there, so the reference pins to the page, never to the gap above.
  const alignFraction = (a: S.AlignValue): number =>
    a === 'start' ? 0 : a === 'center' ? 0.5 : a === 'end' ? 1 : Math.min(1, Math.max(0, a));
  const alignPoint = (al: S.AlignmentValue, v: S.Size): S.Point => {
    const rtl = ctx.getState().direction === 'rtl';
    const ax = rtl && al.x === 'start' ? 'end' : rtl && al.x === 'end' ? 'start' : al.x;
    const p = pad();
    return {
      x: p + (v.width - 2 * p) * alignFraction(ax),
      y: p + (v.height - 2 * p) * alignFraction(al.y),
    };
  };
  const anchorPoint = (): S.Point => alignPoint(ctx.getState().anchorAlign, vp());

  /** Fit-box for resolving the zoom intent: whole scene (fit-all), the current item
   *  (paged — per-page fit), or the document max (continuous — doc-stable zoom). */
  const fitBox = (item: S.SceneItem): S.Size => {
    if (isFitAll()) return buildScene().size;
    return paged() ? { width: item.width, height: item.height } : buildScene().maxItemSize;
  };
  /** Clamp rect for a camera write targeting this item (scene-wide in continuous). */
  const boundsFor = (it: S.SceneItem): S.Rect => (paged() ? itemRect(it) : sceneRect());
  /** Clamp rect for a "stay" write (pan/zoom): the slice item (paged) / the scene. */
  const stayBounds = (): S.Rect => (paged() ? itemRect(buildScene().items[0]) : sceneRect());

  const constraint = (): S.CameraConstraint => ({
    bounded: ctx.getState().bounded,
    padding: pad(),
    fitAlign: ctx.getState().fitAlign,
    direction: ctx.getState().direction,
  });

  const anchorAt = (at: S.Point): S.Anchor => {
    const sc = buildScene();
    return sc.itemCount
      ? S.anchorFromCamera(cam(), sc, vp(), at)
      : { pageIndex: ctx.getState().cursor, fx: 0.5, fy: 0 };
  };
  const currentAnchor = (): S.Anchor => anchorAt(anchorPoint());

  const indexOfPage = (page: PageRef): number =>
    ctx.document()?.pages.findIndex((p) => p.ref.pageObjectNumber === page.pageObjectNumber) ?? -1;

  return {
    cam,
    vp,
    dpr,
    pad,
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
