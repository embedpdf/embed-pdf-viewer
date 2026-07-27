import * as S from '@embedpdf/core-stage';
import {
  addRotations,
  applyRect,
  applyPoint,
  displaySize,
  intersectRects,
  pageTransform,
  rotateScaleMatrix,
  snapToDevice,
} from '@embedpdf/core-geometry';
import type { Rect } from '@embedpdf/core-geometry';
import type { PluginContext } from '@embedpdf/core';
import { SETTINGS_EFFECT, SETTING_KEYS } from './settings';
import type { SettingEffect } from './settings';
import type {
  GoToOptions,
  RevealAnchorValue,
  RevealOptions,
  Scheduler,
  StageAction,
  StageCapability,
  StageConfig,
  StageSettings,
  StageState,
  StageViewState,
  Viewpoint,
  VisiblePage,
} from './types';

/**
 * The Stage capability — selectors (pure reads) + intents (the only writers).
 *
 * Layering, stated honestly:
 *   • stage-core — PURE spatial math (no DOM, no time). Ports to Rust later.
 *   • this capability — the IMPURE platform shell. It dispatches, caches, and owns
 *     the camera tween. It is NOT pure; the one host dependency it has (frame
 *     timing) enters through an injected Scheduler, never a hidden global.
 *
 * The model: EVERY camera move is defined by what it holds fixed.
 *   • gestures (pan/pinch/wheel)  — the content under the pointer. Physics, no setting.
 *   • focal zoom (zoomIn/zoomTo/fit-mode switches) — the zoomAlign viewport point.
 *   • reframes (resize/rotate/re-layout)           — the page-point at the anchorAlign
 *     viewport point: captured there before the change, restored there after.
 *   • arrivals (goToPage/next/prev/reset)          — nothing prior: a fresh landing at
 *     arrivalAlign, THE SAME at every zoom (landing is policy, never a zoom side effect).
 *   • explicit (reveal/destination/viewpoint)      — whatever the call specifies.
 * fitAlign stands apart: the clamp's standing rest constraint wherever an axis has no
 * freedom against the TRUE bounds — it shapes every move above, and is why a fitting
 * axis settles identically whatever arrivalAlign says.
 *
 * "Does it fit the viewport?" still decides SIZE and SUBJECT — never alignment:
 *   • step size: next/prev step by ITEM (spread) when the item fits, by PAGE when
 *     zoomed in past it.
 *   • subject:   you arrive AT the unit that fits (item, page — or the whole scene
 *     under fit-all).
 *
 * The `cursor` is THE current page in both flows: navigation sets it; continuous
 * scrolling syncs it from the camera; paged panning never moves it.
 */
export function createStageCapability(
  ctx: PluginContext<StageState, StageAction>,
  config: StageConfig = {},
): StageCapability {
  // ── host timing seam (the only host dependency) ──────────────────────────────
  const host = globalThis as {
    requestAnimationFrame?: (cb: (t: number) => void) => number;
    cancelAnimationFrame?: (handle: number) => void;
  };
  const canAnimate = !!config.scheduler || typeof host.requestAnimationFrame === 'function';
  const scheduler: Scheduler =
    config.scheduler ??
    (typeof host.requestAnimationFrame === 'function'
      ? { raf: (cb) => host.requestAnimationFrame!(cb), caf: (h) => host.cancelAnimationFrame!(h) }
      : { raf: () => 0, caf: () => {} }); // no host frames → navigation jumps instantly

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

  /**
   * One axis of a positioned-reveal camera. `undefined` = 'nearest' (only
   * move if the target is outside the padded view) — unless the zoom just
   * changed, where "don't move" is meaningless and the spec's slack-axis
   * rule (center) applies. 'keep' never moves the axis (PDF /XYZ null).
   */
  const revealAxis = (
    a: RevealAnchorValue | undefined,
    camPos: number,
    rectPos: number,
    rectExtent: number,
    vpExtent: number,
    zoom: number,
    zoomChanged: boolean,
  ): number => {
    if (a === 'keep') return camPos;
    const p = pad();
    if (a === undefined) {
      if (!zoomChanged) {
        const lo = camPos + p / zoom;
        const hi = camPos + (vpExtent - p) / zoom;
        if (rectPos >= lo && rectPos + rectExtent <= hi) return camPos; // already visible
        if (rectExtent > hi - lo || rectPos < lo) return rectPos - p / zoom;
        return rectPos + rectExtent - (vpExtent - p) / zoom;
      }
      a = 'center';
    }
    if (a === 'start') return rectPos - p / zoom;
    if (a === 'end') return rectPos + rectExtent - (vpExtent - p) / zoom;
    const f = a === 'center' ? 0.5 : Math.min(1, Math.max(0, a));
    return rectPos + rectExtent / 2 - (vpExtent * f) / zoom;
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

  // The ONE low-level camera write: clamp to `bounds`, dispatch. MECHANISM only —
  // it never touches the cursor (see syncCursorFromCamera for the policy).
  const setCam = (next: S.Camera, bounds: S.Rect = stayBounds()) => {
    ctx.dispatch({ type: 'CAMERA', camera: S.clampCamera(next, bounds, vp(), constraint()) });
  };

  /**
   * Cursor reconciliation, one direction per interaction:
   *   navigation  → cursor is INTENT, set explicitly; the camera honors it as far
   *                 as the clamp allows — and a clamped camera never revokes it.
   *   manipulation → (pan / drag / pinch) the camera moves freely; the cursor is
   *                 DERIVED from it. Only those verbs call this. Paged never syncs.
   */
  const syncCursorFromCamera = () => {
    if (paged()) return;
    const sc = buildScene();
    if (!sc.itemCount) return;
    const page = S.anchorFromCamera(cam(), sc, vp()).pageIndex;
    if (page !== ctx.getState().cursor) ctx.dispatch({ type: 'CURSOR', cursor: page });
  };

  // ── camera tween (impure shell concern; uses the injected Scheduler) ─────────
  let raf = 0;
  const cancelAnim = () => {
    if (raf) {
      scheduler.caf(raf);
      raf = 0;
    }
  };
  const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
  // The tween clamps to an EXPLICIT bounds rect every frame (never a re-derived
  // current item), so animating toward a different item isn't clamped back.
  // `then` runs on natural completion only — a cancelled tween belongs to the
  // verb that cancelled it.
  const animateTo = (target: S.Camera, bounds: S.Rect, ms = 240, then?: () => void) => {
    if (!canAnimate) {
      setCam(target, bounds);
      then?.();
      return;
    }
    cancelAnim();
    const from = cam();
    const ease = (t: number) => 1 - Math.pow(1 - t, 3);
    let started = false;
    let t0 = 0;
    const tick = (now: number) => {
      if (!started) {
        started = true;
        t0 = now; // anchor to the first real timestamp (works even when now === 0)
      }
      const k = ease(Math.min(1, (now - t0) / ms));
      setCam(
        {
          x: lerp(from.x, target.x, k),
          y: lerp(from.y, target.y, k),
          zoom: lerp(from.zoom, target.zoom, k),
        },
        bounds,
      );
      if (k < 1) {
        raf = scheduler.raf(tick);
      } else {
        raf = 0;
        then?.();
      }
    };
    raf = scheduler.raf(tick);
  };

  // ── anchor: the durable "what am I looking at". Capture before a structural
  //    change, re-apply after — one mechanism for layout/spread/zoom/resize/restore.
  //    WHERE in the viewport the anchor lives is the reframe's invariant policy:
  //    anchorAlign for reframes (resize, scene changes), zoomAlign for pure
  //    zoom-intent changes. Capture and restore always use the SAME point.
  const anchorAt = (at: S.Point): S.Anchor => {
    const sc = buildScene();
    return sc.itemCount
      ? S.anchorFromCamera(cam(), sc, vp(), at)
      : { pageIndex: ctx.getState().cursor, fx: 0.5, fy: 0 };
  };
  const currentAnchor = (): S.Anchor => anchorAt(anchorPoint());

  /**
   * Run a placement whose RESOLVED zoom may change the scene (wrapped mode: zoom is
   * a layout input). Re-run it until the scene it placed against is the scene that
   * results — every non-wrapped mode is stable after the first pass by construction,
   * and wrapped fit-modes converge on the second (the fit-box is wrap-independent).
   * Capped at 3 passes for the one genuinely circular case (fit-all + wrapped).
   */
  const stabilized = (place: () => void) => {
    for (let attempt = 0; attempt < 3; attempt++) {
      const scene = buildScene();
      place();
      if (buildScene() === scene) return;
    }
  };

  const applyAnchor = (anchor: S.Anchor, align?: S.AlignmentValue) => {
    stabilized(() => {
      const scene = buildScene();
      if (!scene.itemCount) return;
      const item = scene.items[scene.itemOfPage(anchor.pageIndex)];
      const zoom = S.resolveZoom(ctx.getState().zoom, fitBox(item), vp(), pad());
      // resolved against the CURRENT viewport — a resize restores the anchor to
      // the new viewport's policy point (start/start: the top stays pinned)
      const at = alignPoint(align ?? ctx.getState().anchorAlign, vp());
      setCam(S.cameraFromAnchor(anchor, scene, vp(), zoom, at), boundsFor(item));
    });
  };
  /**
   * Re-apply the view after a structural/zoom/viewport change. Normally anchor-
   * preserving (keep looking at the same spot, held at the invariant point).
   * Under fit-all the subject is the WHOLE scene, so "keep my anchor" is
   * meaningless — re-place instead (this is what centers the scene even when
   * unbounded).
   */
  const reapply = (anchor: S.Anchor, align?: S.AlignmentValue) => {
    if (isFitAll()) goToTarget(ctx.getState().cursor, { behavior: 'instant' });
    else applyAnchor(anchor, align);
  };

  // ── navigation: ONE arrival procedure for goToPage / next / prev / reset ─────
  // Navigation is CANONICAL: goToPage(N) always ends in the same camera state,
  // regardless of where you came from, what happens to be visible, or how zoomed
  // you are (no zoom-dependent landing — that's a discontinuity at the fit
  // threshold).
  // 1. move the cursor to the target page (paged: rebuilds the one-item slice),
  // 2. choose the SUBJECT by the fits-predicate (scene under fit-all; the item if
  //    it fits; else the page),
  // 3. placeCamera(subject) lands it at arrivalAlign — the same rule at every
  //    zoom — and setCam clamps against the TRUE bounds, which collapses any
  //    axis with no freedom to the fitAlign rest point.
  // The legitimate "nothing moves" cases are STRUCTURAL, not conditional: under
  // fit-all the canonical placement is the centered scene, which doesn't change.
  const goToTarget = (pageIndex: number, opts?: GoToOptions) => {
    cancelAnim();
    const doc = ctx.document();
    if (!doc || doc.pageCount === 0) return;
    const target = Math.max(0, Math.min(pageIndex, doc.pageCount - 1));
    if (target !== ctx.getState().cursor) ctx.dispatch({ type: 'CURSOR', cursor: target });

    // Restore path (per-page view memory): exact viewpoint instead of fresh placement.
    if (opts?.viewpoint) {
      ctx.dispatch({ type: 'PATCH', patch: { zoom: opts.viewpoint.zoom } });
      applyAnchor(opts.viewpoint.anchor);
      return;
    }

    // Placement against the CURRENT scene; null when there is nothing to place.
    const placement = (): { camera: S.Camera; bounds: S.Rect } | null => {
      const sc = buildScene(); // paged: the (possibly new) slice; continuous: full scene
      if (!sc.itemCount) return null;
      const item = paged() ? sc.items[0] : sc.items[itemIndexOfPage(target)];
      const zoom = S.resolveZoom(ctx.getState().zoom, fitBox(item), vp(), pad());
      const subject = isFitAll()
        ? sceneRect()
        : fits(itemRect(item), zoom)
          ? itemRect(item)
          : pageRectOf(item, target);
      // The landing policy: a per-call override beats the setting (explicit
      // beats default); 'keep' pins that axis to the current camera.
      const want = { ...ctx.getState().arrivalAlign, ...opts?.arrivalAlign };
      const placed = S.placeCamera(
        subject,
        vp(),
        zoom,
        pad(),
        {
          x: want.x === 'keep' ? 'start' : want.x,
          y: want.y === 'keep' ? 'start' : want.y,
        },
        ctx.getState().direction,
      );
      // Arrivals are canonical even on an UNBOUNDED stage: the landing clamps
      // within the true bounds regardless (free roam is a manipulation
      // affordance, not an arrival one) — an axis with no freedom collapses to
      // its fitAlign rest here, and the fit-all scene centers even unbounded.
      const bounds = boundsFor(item);
      const settled = S.clampCamera(placed, bounds, vp(), { ...constraint(), bounded: true });
      return {
        camera: {
          zoom,
          x: want.x === 'keep' ? cam().x : settled.x,
          y: want.y === 'keep' ? cam().y : settled.y,
        },
        bounds,
      };
    };

    if ((opts?.behavior ?? ctx.getState().scrollBehavior) === 'smooth') {
      const p = placement();
      if (p) animateTo(p.camera, p.bounds);
    } else {
      // instant placement converges with the scene (wrapped: zoom is a layout input)
      stabilized(() => {
        const p = placement();
        if (p) setCam(p.camera, p.bounds);
      });
    }
  };

  /** Step by the navigation unit: the ITEM when it fits the viewport, else the PAGE. */
  const step = (direction: 1 | -1, opts?: GoToOptions) => {
    const st = ctx.getState();
    const item = cursorItem();
    if (!item) return;
    const { grouping: g } = grouping();
    if (isFitAll() || fits(itemRect(item), cam().zoom)) {
      const idx = Math.max(0, Math.min(itemIndexOfPage(st.cursor) + direction, g.length - 1));
      goToTarget(g[idx][0], opts);
    } else {
      goToTarget(st.cursor + direction, opts);
    }
  };

  // pon (durable identity) for a page's display index, from the registry captured at open.
  const ponForIndex = (index: number): number =>
    ctx.document()?.pages[index]?.pageObjectNumber ?? index + 1;

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
    // device-snapped footprint top-left (camera-resolved) — keeps a rotated page
    // on the device grid; the adapter just consumes it.
    const screenX = snapToDevice((box.x - c.x) * c.zoom, ratio);
    const screenY = snapToDevice((box.y - c.y) * c.zoom, ratio);
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
        ? transform.viewToPageRect(onScreen)
        : { x: 0, y: 0, width: 0, height: 0 };
    return {
      ...box,
      pon: ponForIndex(box.pageIndex),
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
  let scrollMemo: S.ScrollMetrics | null = null;
  const scrollMetricsNow = (): S.ScrollMetrics => {
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
  let visSig = '';
  let vis: VisiblePage[] = [];
  const visiblePages = (): VisiblePage[] => {
    const c = cam();
    const v = vp();
    const sc = buildScene();
    const items = paged() ? sc.items.slice(0, 1) : sc.query(S.cameraWorldRect(c, v));
    const sig = `${sceneCache!.key}|${ctx.getState().flow}|${c.x},${c.y},${c.zoom}|${v.width}x${v.height}|${dpr()}`;
    if (sig === visSig) return vis;
    visSig = sig;
    vis = items.flatMap((it) => it.pages).map(withTransform);
    return vis;
  };

  // The settings slice of a larger object (state, or a saved view) — derived from
  // the registry, so the shape is never spelled out by hand again.
  const pickSettings = (src: StageSettings): StageSettings => {
    const out: Partial<Record<keyof StageSettings, unknown>> = {};
    for (const k of SETTING_KEYS) out[k] = src[k];
    return out as StageSettings;
  };
  const snapshotSettings = (): StageSettings => pickSettings(ctx.getState());

  // Initial-view providers (persist, deep-link, an explicit prop…). One owner
  // (placeInitial) resolves them by priority — no effect-ordering races.
  const initialViewProviders: Array<{ priority: number; fn: () => StageViewState | null }> = [];
  let hasPlaced = false;

  const api: StageCapability = {
    // ── selectors ──
    camera: cam,
    viewport: vp,
    scrollMetrics: scrollMetricsNow,
    pageCount: () => ctx.document()?.pageCount ?? 0,
    visiblePages,
    currentPage: () => ctx.getState().cursor,
    currentItemPages: () => {
      const item = cursorItem();
      return item ? [...item.pageIndexes] : [];
    },
    pages: () =>
      (ctx.document()?.pages ?? []).map((p) => ({
        index: p.index,
        pon: p.pageObjectNumber,
        label: p.label ?? null,
      })),
    pageRect: (pon) => {
      const meta = ctx.document();
      const index = meta ? meta.pages.findIndex((p) => p.pageObjectNumber === pon) : -1;
      if (index < 0) return null;
      const sc = buildScene();
      if (!sc.itemCount) return null;
      const box = sc.items[sc.itemOfPage(index)].pages.find((p) => p.pageIndex === index);
      return box ? withTransform(box) : null;
    },
    pageAt: (screen) => {
      // Find the visible page whose device-snapped display box contains the
      // point, then invert that page's transform — same `viewToPage` the
      // per-page PageContext.toPagePoint uses, so the two never drift.
      for (const p of visiblePages()) {
        const lx = screen.x - p.screenX;
        const ly = screen.y - p.screenY;
        if (lx >= 0 && ly >= 0 && lx <= p.transform.viewWidth && ly <= p.transform.viewHeight) {
          return {
            pon: p.pon,
            point: p.transform.viewToPage({ x: lx, y: ly }),
            scale: p.transform.viewScale,
            rotation: p.rotation,
            zoom: p.transform.zoom,
          };
        }
      }
      return null;
    },
    pointOnPage: (pon, screen) => {
      // `pageAt` minus the containment check: project onto ONE page's plane,
      // valid outside its bounds — the same inverse transform, so no drift.
      const p = visiblePages().find((v) => v.pon === pon);
      if (!p) return null;
      return p.transform.viewToPage({ x: screen.x - p.screenX, y: screen.y - p.screenY });
    },
    pageToWorld: (pon, pt) => {
      const pr = api.pageRect(pon);
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
    },
    pageRectToScreen: (pon, rect) => {
      const pr = api.pageRect(pon);
      if (!pr) return null;
      const content = displaySize({ width: pr.width, height: pr.height }, pr.rotation);
      const m = rotateScaleMatrix(pr.contentScale, content.width, content.height, pr.rotation);
      const wr = applyRect(m, rect);
      const c = cam();
      const tl = S.toScreen(c, { x: pr.x + wr.x, y: pr.y + wr.y });
      return { x: tl.x, y: tl.y, width: wr.width * c.zoom, height: wr.height * c.zoom };
    },
    toScreen: (w) => S.toScreen(cam(), w),
    toWorld: (s) => S.toWorld(cam(), s),
    flow: () => ctx.getState().flow,
    layout: () => ctx.getState().layout,
    spread: () => ctx.getState().spread,
    sizing: () => ctx.getState().sizing,
    columns: () => ctx.getState().columns,
    bounded: () => ctx.getState().bounded,
    padding: () => ctx.getState().padding,
    gap: () => ctx.getState().gap,
    pageFrame: () => ctx.getState().pageFrame,
    fitAlign: () => ctx.getState().fitAlign,
    arrivalAlign: () => ctx.getState().arrivalAlign,
    zoomAlign: () => ctx.getState().zoomAlign,
    anchorAlign: () => ctx.getState().anchorAlign,
    direction: () => ctx.getState().direction,
    scrollBehavior: () => ctx.getState().scrollBehavior,
    viewRotation: () => ctx.getState().viewRotation,
    zoomLevel: () => cam().zoom,
    zoomMode: () => {
      const z = ctx.getState().zoom;
      return 'mode' in z ? z.mode : 'custom';
    },
    viewpoint: (): Viewpoint => ({ anchor: currentAnchor(), zoom: ctx.getState().zoom }),
    settings: snapshotSettings,
    viewState: (): StageViewState => ({
      ...snapshotSettings(),
      cursor: ctx.getState().cursor,
      anchor: currentAnchor(),
    }),

    // ── intents ──
    setViewport: (v) => {
      // Initial placement is LEVEL-triggered, owned here: the moment the stage
      // first learns a real size (both axes) and the document has pages, resolve
      // the initial view (persist/deep-link providers, else reset). Every report
      // re-checks the condition — no watch, no effect-registration race, no edge
      // to miss when the viewport was already sized before anyone listened.
      if (!hasPlaced) {
        ctx.dispatch({ type: 'VP', vp: v });
        if (v.width > 0 && v.height > 0 && (ctx.document()?.pageCount ?? 0) > 0) {
          api.placeInitial();
        }
        return;
      }
      // Afterwards every resize keeps the same page and re-resolves fit-modes.
      cancelAnim();
      const anchor = currentAnchor(); // measured against the OLD viewport
      ctx.dispatch({ type: 'VP', vp: v }); // new viewport
      reapply(anchor);
    },
    setDevicePixelRatio: (ratio) => {
      // Pure device-resolution change: it only affects each page transform's
      // device px (crispness) + sub-pixel box snapping, never the layout or
      // camera — so no re-place, just store it; visiblePages re-keys on dpr.
      if (ratio > 0 && ratio !== dpr()) ctx.dispatch({ type: 'DPR', dpr: ratio });
    },
    setCamera: (c) => {
      cancelAnim();
      setCam(c);
      syncCursorFromCamera();
    },
    panBy: (dx, dy) => {
      cancelAnim();
      setCam(S.panByScreen(cam(), dx, dy));
      syncCursorFromCamera();
    },
    scrollTo: (opts) => {
      cancelAnim();
      const sc = buildScene();
      if (!sc.itemCount) return;
      const next = S.cameraFromScroll(cam(), stayBounds(), vp(), pad(), opts);
      if (opts.behavior === 'smooth') {
        animateTo(next, stayBounds(), 240, syncCursorFromCamera);
      } else {
        setCam(next);
        syncCursorFromCamera();
      }
    },
    scrollBy: ({ left, top, behavior }) => {
      const m = scrollMetricsNow();
      api.scrollTo({
        left: left === undefined ? undefined : m.scrollLeft + left,
        top: top === undefined ? undefined : m.scrollTop + top,
        behavior,
      });
    },
    zoomAround: (pt, factor) => {
      cancelAnim();
      const before = buildScene();
      // page-relative focal point: the durable identity of "what's under the cursor"
      const focal = before.itemCount ? S.anchorAtPoint(before, S.toWorld(cam(), pt)) : null;
      setCam(S.zoomAround(cam(), pt, factor));
      // record the resulting fixed level as the zoom intent — focal, so no re-anchor…
      ctx.dispatch({ type: 'PATCH', patch: { zoom: { level: cam().zoom } } });
      // …UNLESS zoom is a LAYOUT INPUT (wrapped grid) and the scene just re-wrapped
      // underneath the camera. The old world point is stale then — re-pin the SAME
      // page-point under the cursor and clamp against the new geometry. In every
      // non-wrapped mode the scene reference is unchanged and this never runs.
      const after = buildScene();
      if (after !== before && focal && after.itemCount) {
        setCam(S.cameraForAnchorAtScreen(focal, after, pt, cam().zoom));
      }
      syncCursorFromCamera();
    },
    // Pointer-less zooms magnify around the zoomAlign focal point (pinch and
    // wheel pass their own pointer to zoomAround — physics beats policy).
    zoomIn: () => api.zoomAround(alignPoint(ctx.getState().zoomAlign, vp()), 1.2),
    zoomOut: () => api.zoomAround(alignPoint(ctx.getState().zoomAlign, vp()), 1 / 1.2),
    zoomTo: (spec) => api.update({ zoom: spec }),
    fitWidth: () => api.update({ zoom: { mode: S.ZoomMode.FitWidth } }),
    fitPage: () => api.update({ zoom: { mode: S.ZoomMode.FitPage } }),
    fitAll: () => api.update({ zoom: { mode: S.ZoomMode.FitAll } }),
    automatic: () => api.update({ zoom: { mode: S.ZoomMode.Automatic } }),
    refit: () => {
      // The page geometry changed underneath us (rotate/move/delete). Treat it
      // exactly like a viewport resize: re-resolve the active zoom intent and
      // re-place against the now-current scene, keeping the anchored page-point.
      // No-op until the first placement; the scene is re-keyed on the registry
      // revision, so `reapply` reads the rotated footprint.
      if (!hasPlaced) return;
      cancelAnim();
      reapply(currentAnchor());
    },
    goToPage: (pageIndex, opts) => goToTarget(pageIndex, opts),
    reveal: (pageIndex, opts) => {
      const doc = ctx.document();
      if (!doc || doc.pageCount === 0) return;
      const target = Math.max(0, Math.min(pageIndex, doc.pageCount - 1));
      const positioned =
        !!opts &&
        (opts.rect !== undefined ||
          opts.anchor !== undefined ||
          (opts.zoom !== undefined && opts.zoom !== 'keep'));

      if (!positioned) {
        // Bare reveal — NOT navigation: minimal visibility, cursor untouched.
        if (paged()) {
          // the page isn't in the one-item slice — revealing it IS navigating to it
          goToTarget(target, opts);
          return;
        }
        const sc = buildScene();
        if (!sc.itemCount) return;
        const page = pageRectOf(sc.items[itemIndexOfPage(target)], target);
        // Reveal the OUTER box: pageFrame chrome (labels, buttons) belongs to the
        // page, so "make the page visible" includes its reserved bands.
        const m = worldPageFrame();
        const box = {
          x: page.x - m.left,
          y: page.y - m.top,
          width: page.width + m.left + m.right,
          height: page.height + m.top + m.bottom,
        };
        const camera = S.revealCamera(cam(), box, vp(), pad());
        const current = cam();
        if (camera.x === current.x && camera.y === current.y) return; // already visible
        cancelAnim();
        if ((opts?.behavior ?? ctx.getState().scrollBehavior) === 'smooth') {
          animateTo(camera, sceneRect());
        } else {
          setCam(camera, sceneRect());
        }
        return;
      }

      // Positioned reveal: an ARRIVAL at a rect/point (search hit, PDF
      // destination). Like navigation, the cursor is INTENT — set up front
      // (paged: this also rebuilds the one-item slice), not derived from a
      // possibly mid-tween camera.
      cancelAnim();
      if (target !== ctx.getState().cursor) {
        ctx.dispatch({ type: 'CURSOR', cursor: target });
      }

      const place = (): { camera: S.Camera; bounds: S.Rect; zoomChanged: boolean } | null => {
        const sc = buildScene();
        if (!sc.itemCount) return null;
        const item = paged() ? sc.items[0] : sc.items[itemIndexOfPage(target)];
        const world = opts.rect
          ? worldRectForContent(item, target, opts.rect)
          : pageRectOf(item, target);
        const zd = opts.zoom ?? 'keep';
        const availW = Math.max(1, vp().width - 2 * pad());
        const availH = Math.max(1, vp().height - 2 * pad());
        let zoom =
          typeof zd === 'object'
            ? zd.level
            : zd === 'fit'
              ? Math.min(availW / world.width, availH / world.height)
              : zd === 'fit-width'
                ? availW / world.width
                : zd === 'fit-height'
                  ? availH / world.height
                  : cam().zoom;
        // Degenerate target (a point with a fit directive) → pan only.
        if (!Number.isFinite(zoom) || zoom <= 0) zoom = cam().zoom;
        const zoomChanged = zd !== 'keep';
        const a = opts.anchor ?? {};
        return {
          camera: {
            x: revealAxis(a.x, cam().x, world.x, world.width, vp().width, zoom, zoomChanged),
            y: revealAxis(a.y, cam().y, world.y, world.height, vp().height, zoom, zoomChanged),
            zoom,
          },
          bounds: boundsFor(item),
          zoomChanged,
        };
      };

      const first = place();
      if (!first) return;
      // A resolved zoom becomes the zoom intent (like zoomAround), so later
      // resizes/refits keep the destination's magnification.
      if (first.zoomChanged) {
        ctx.dispatch({ type: 'PATCH', patch: { zoom: { level: first.camera.zoom } } });
      }
      if ((opts.behavior ?? ctx.getState().scrollBehavior) === 'smooth') {
        // If the zoom patch re-wrapped the scene (zoom is a layout input in
        // wrapped mode), recompute once against the new geometry.
        const p = place() ?? first;
        animateTo(p.camera, p.bounds);
      } else {
        stabilized(() => {
          const p = place();
          if (p) setCam(p.camera, p.bounds);
        });
      }
    },
    next: (opts) => step(1, opts),
    prev: (opts) => step(-1, opts),
    update: (patch) => {
      cancelAnim();
      // React per the registry — the strongest effect among the touched settings
      // wins: 'reflow' ⊃ 'scene'/'refit' ⊃ 'reclamp' ⊃ 'none'.
      const touched = (effect: SettingEffect) =>
        SETTING_KEYS.some((k) => patch[k] !== undefined && SETTINGS_EFFECT[k] === effect);
      // The change's INVARIANT point: a pure zoom-intent change ('refit' alone)
      // holds the zoomAlign focal point — zoomTo/fit-mode switches magnify
      // around the same spot the zoom buttons do; every other reframe holds
      // the anchorAlign reference. Resolved once, used for capture AND restore.
      const align =
        touched('refit') && !touched('scene') && !touched('reflow')
          ? ctx.getState().zoomAlign
          : ctx.getState().anchorAlign;
      const anchor = anchorAt(alignPoint(align, vp())); // capture against the current scene
      ctx.dispatch({ type: 'PATCH', patch });
      if (touched('scene')) sceneCache = null;
      if (touched('reflow')) {
        // flow toggled: re-place onto the cursor's page under the new flow's scene
        // (the camera's coordinates are meaningless across the flow boundary).
        goToTarget(ctx.getState().cursor, { behavior: 'instant' });
      } else if (touched('scene') || touched('refit')) {
        reapply(anchor, align); // rebuild + keep page + re-fit (fit-all: re-place the scene)
      } else if (touched('reclamp')) {
        setCam(cam()); // clamp policy changed: just re-clamp the current camera
      }
      // 'none' (arrivalAlign, zoomAlign, anchorAlign, scrollBehavior): future verbs only
    },
    setFlow: (flow) => api.update({ flow }),
    setLayout: (layout) => api.update({ layout }),
    setSpread: (spread) => api.update({ spread }),
    setSizing: (sizing) => api.update({ sizing }),
    setColumns: (columns) => api.update({ columns }),
    setBounded: (bounded) => api.update({ bounded }),
    setPadding: (padding) => api.update({ padding }),
    setGap: (gap) => api.update({ gap }),
    setPageFrame: (pageFrame) => api.update({ pageFrame }),
    setFitAlign: (fitAlign) => api.update({ fitAlign }),
    setArrivalAlign: (arrivalAlign) => api.update({ arrivalAlign }),
    setZoomAlign: (zoomAlign) => api.update({ zoomAlign }),
    setAnchorAlign: (anchorAlign) => api.update({ anchorAlign }),
    setDirection: (direction) => api.update({ direction }),
    setViewRotation: (viewRotation) => api.update({ viewRotation }),
    rotateView: (delta) =>
      api.setViewRotation(addRotations(ctx.getState().viewRotation, delta === 90 ? 90 : 270)),
    setScrollBehavior: (behavior) => api.update({ scrollBehavior: behavior }),
    applyViewState: (view) => {
      cancelAnim();
      ctx.dispatch({ type: 'PATCH', patch: pickSettings(view) });
      ctx.dispatch({ type: 'CURSOR', cursor: view.cursor ?? 0 });
      sceneCache = null;
      applyAnchor(view.anchor);
    },
    provideInitialView: (priority, fn) => {
      initialViewProviders.push({ priority, fn });
    },
    placeInitial: () => {
      hasPlaced = true;
      const sorted = [...initialViewProviders].sort((a, b) => b.priority - a.priority);
      for (const p of sorted) {
        const view = p.fn();
        if (view) {
          api.applyViewState(view);
          return;
        }
      }
      api.resetView();
    },
    // Home = page 0, a fresh arrival at arrivalAlign (the clamp collapses any
    // fitting axis to its fitAlign rest point).
    resetView: () => goToTarget(0, { behavior: 'instant' }),
  };
  return api;
}
