/**
 * Stage / RenderLayer + facade hooks.
 *
 * <Stage> virtualizes and positions page surfaces by the camera, and hands each
 * one to YOUR render prop — you bring the layers. (The standalone, Stage-free
 * single-page surface lives in `./page-view` so it never pulls the stage plugin.)
 */

// One-line-per-feature: registration travels with the UI.
export * from '@embedpdf/plugin-stage';
import * as React from 'react';
import { useEffect, useMemo, useRef } from 'react';
import { StageToken, settingsEqual, wheelZoomFactor } from '@embedpdf/plugin-stage';
import type { StageCapability, VisiblePage } from '@embedpdf/plugin-stage';
import type { CapabilityToken } from '@embedpdf/core';

/** Which stage lens to bind to. Defaults to the main StageToken — pass a custom
 *  token to drive an additional lens (e.g. a wrapped thumbnail sidebar). */
export type StageTokenProp = CapabilityToken<StageCapability>;
import type { PageFrame } from '@embedpdf/core-geometry';
import { InteractionToken } from '@embedpdf/plugin-interaction';
import type { PointerSample } from '@embedpdf/plugin-interaction';
import { ProjectorProvider, type ProjectorBinding, type ViewProjector } from './anchored';
import { createClickCounter } from './interaction';
import {
  makePageContext,
  PageProvider,
  useCapability,
  useDocumentId,
  useKernelValue,
  useOptionalCapability,
  useSelector,
} from './runtime';
import type { PageContextValue } from './runtime';

function PageSurface({
  documentId,
  page,
  frame,
  stage,
  render,
  chrome,
}: {
  documentId: string;
  page: VisiblePage;
  /** Reserved chrome bands around the page (screen px); the layout reserved the
   *  matching space, so the outer box tiles into it. */
  frame: PageFrame;
  /** The stage capability — the demand getter reads visibility LIVE off it. */
  stage: StageCapability;
  render: (page: PageContextValue) => React.ReactNode;
  chrome?: (page: PageContextValue) => React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const t = page.transform;
  const rotation = page.rotation;
  // All geometry comes from the transform: the DISPLAY footprint (viewWidth/Height,
  // already w↔h-swapped + device-snapped) and the UN-rotated content box
  // (contentWidth/Height). The shell never re-derives `* zoom` / `* dpr` / snapping.
  const outerW = t.viewWidth + frame.left + frame.right;
  const outerH = t.viewHeight + frame.top + frame.bottom;
  // page.screenX/screenY are the device-snapped footprint top-left; the outer box
  // sits one frame further out so the content keeps its scene position.
  const left = page.screenX - frame.left;
  const top = page.screenY - frame.top;
  // Center the (possibly rotated) content box on the display box and rotate about
  // its center — NO translate(), so rotation 0 carries no transform and pixel-snaps
  // like the axis-aligned shadow behind it (no hairline seam).
  const contentLeft = frame.left + (t.viewWidth - t.contentWidth) / 2;
  const contentTop = frame.top + (t.viewHeight - t.contentHeight) / 2;
  // The page-view DEMAND is a PULL: the getter closes over
  // stable references (capability + pon) and reads the stage's live state at
  // call time — visibility is the STAGE's data (`VisiblePage.visibleRect`),
  // not something an adapter re-derives or caches. Absent from the visible
  // set = zero rect ("want nothing"), distinct from PageView's undefined
  // getter ("whole page").
  const ctx = useMemo(
    () =>
      makePageContext(
        documentId,
        page.pon,
        page.pageIndex,
        frame,
        t,
        () => ref.current!.getBoundingClientRect(),
        () => {
          const live = stage.visiblePages().find((p) => p.pon === page.pon);
          return live
            ? { desiredDeviceWidth: live.transform.deviceWidth, visibleRect: live.visibleRect }
            : {
                desiredDeviceWidth: t.deviceWidth,
                visibleRect: { x: 0, y: 0, width: 0, height: 0 },
              };
        },
      ),
    [documentId, page.pon, page.pageIndex, frame, t, stage],
  );
  return (
    <div style={{ position: 'absolute', left, top, width: outerW, height: outerH }}>
      <PageProvider value={ctx}>
        {/* drop shadow ONLY — axis-aligned at the content box (inset by the frame),
            transparent fill so it can never peek out behind the bitmap, and it
            stays put under rotation. */}
        <div
          style={{
            position: 'absolute',
            left: frame.left,
            top: frame.top,
            width: t.viewWidth,
            height: t.viewHeight,
            boxShadow: '0 6px 18px rgba(0,0,0,.18)',
          }}
        />
        {/* the page: white backing + bitmap as ONE rasterized box, so there is no
            seam between them and nothing white larger than the bitmap to leak.
            The ONLY thing rotation turns; markers/annotations ride it in content
            coordinates. Rotation 0 carries no transform → pixel-snaps cleanly. */}
        <div
          ref={ref}
          style={{
            position: 'absolute',
            left: contentLeft,
            top: contentTop,
            width: t.contentWidth,
            height: t.contentHeight,
            background: '#fff',
            transform: rotation ? `rotate(${rotation}deg)` : undefined,
            // We render our own selection highlights — suppress native text/image
            // selection (and the double-click image grab) on the whole page subtree.
            userSelect: 'none',
            WebkitUserSelect: 'none',
          }}
        >
          {render(ctx)}
        </div>
        {/* box-space chrome — labels, selection border, per-page buttons — fills
            the outer box, NEVER rotates. Bands are plain regions: a label is
            `bottom:0; height: frame.bottom`, a button row `top:0; height: frame.top`. */}
        {chrome?.(ctx)}
      </PageProvider>
    </div>
  );
}

export interface StageProps {
  /**
   * PAGE-SPACE content for each visible page (RenderLayer, annotations,
   * markers). Rendered inside the page's content frame, so it ROTATES with the
   * page's display rotation — coordinates are plain PDF points.
   */
  children: (page: PageContextValue) => React.ReactNode;
  /**
   * BOX-SPACE chrome for each visible page (page-number label, selection
   * border, a per-page rotate/delete button). Rendered into the OUTER box
   * (content + reserved `pageFrame`), so it does NOT rotate and the reserved
   * bands are plain regions (`bottom:0; height: page.frame.bottom`). The three
   * coordinate spaces: `children` (page content), `pageChrome` (page box +
   * frame), `overlay` (viewport).
   */
  pageChrome?: (page: PageContextValue) => React.ReactNode;
  /** Viewport-space UI (menus, controls) rendered above the pages. */
  overlay?: React.ReactNode;
  /**
   * Route this Stage's pointer events to the interaction hub (page-resolved via
   * `pageAt`) instead of the built-in drag-to-pan. Pan then becomes the `pan`
   * tool's job and dragging in `pointer` mode selects text (incl. across pages).
   * Pair with `stagePlugin({ interaction: true })`. Default false (built-in pan).
   */
  interaction?: boolean;
  /**
   * Ambient ZOOM gestures on this stage: ctrl/cmd+wheel and trackpad pinch
   * (Safari gesture events included). Default true. Turn OFF for follower
   * lenses with a fixed magnification — a thumbnail rail should scroll under
   * cmd+wheel, not zoom — so a zoom-wheel falls through to ordinary wheel
   * pan, and pinches are still swallowed (they never page-zoom the browser).
   */
  zoomGestures?: boolean;
  /** The stage lens to drive (default: the main StageToken). */
  token?: StageTokenProp;
  className?: string;
  style?: React.CSSProperties;
}

export function Stage({
  children,
  pageChrome,
  overlay,
  interaction = false,
  zoomGestures = true,
  token = StageToken,
  className,
  style,
}: StageProps) {
  const stage = useCapability(token);
  const ix = useOptionalCapability(InteractionToken);
  const useHub = interaction && !!ix;
  // The hub's resolved cursor (text/grab/…), applied to the viewport when driving.
  const hubCursor = useKernelValue(() => ix?.cursor() ?? 'default');
  const ref = useRef<HTMLDivElement>(null);
  const docId = useDocumentId();
  // visiblePages already folds in the camera (each page carries its device-snapped
  // screenX/screenY + transform), so panning re-emits the list — no separate
  // camera subscription needed for positioning.
  const pages = useSelector(token, (c) => c.visiblePages()); // memoized -> stable ref
  // Reserved chrome bands (screen px), uniform across pages — the frame the
  // outer box reserves and `pageChrome` paints into.
  const frame = useSelector(
    token,
    (c) => c.pageFrame(),
    (a, b) => a.top === b.top && a.right === b.right && a.bottom === b.bottom && a.left === b.left,
  );

  // The Stage's ViewProjector: anchored UI (menus, popovers) positions through
  // the CAMERA — pure state, no DOM reads, no portal, and NO subscription:
  // `pages` (visiblePages) is the binding's revision, so a camera change
  // re-renders the pages AND every anchored consumer in the SAME React
  // commit — surface and overlay can never paint a frame apart.
  const projector = useMemo<ViewProjector>(
    () => ({
      space: 'overlay',
      toScreen: (pon, rect) => stage.pageRectToScreen(pon, rect),
      toScreenPoint: (pon, at) => {
        const r = stage.pageRectToScreen(pon, { x: at.x, y: at.y, width: 0, height: 0 });
        return r ? { x: r.x, y: r.y } : null;
      },
      viewEnv: (pon) => {
        const t = stage.pageRect(pon)?.transform;
        return t ? { scale: t.viewScale, rotation: t.rotation, zoom: t.zoom } : null;
      },
    }),
    [stage],
  );
  const projectorBinding = useMemo<ProjectorBinding>(
    () => ({ projector, revision: pages }),
    [projector, pages],
  );

  useEffect(() => {
    const el = ref.current!;
    // Only report the viewport size. Initial placement (home) is the Stage plugin's
    // job — it watches the viewport and homes once it's ready (and a higher-priority
    // initial-view provider can override that). The shell stays dumb.
    const setVp = () => stage.setViewport({ width: el.clientWidth, height: el.clientHeight });
    const ro = new ResizeObserver(setVp);
    ro.observe(el);
    setVp();

    // Report the device pixel ratio so page transforms render crisp. dppx changes
    // (zoom, dragging between monitors) fire the media query; re-subscribe each
    // time since the query value itself moves.
    let mq: MediaQueryList | null = null;
    const reportDpr = () => {
      stage.setDevicePixelRatio(window.devicePixelRatio || 1);
      mq?.removeEventListener('change', reportDpr);
      mq = window.matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`);
      mq.addEventListener('change', reportDpr);
    };
    reportDpr();

    // Wheel is ambient navigation in BOTH modes: ctrl/meta zooms (classified
    // per input — synthesized pinch, mouse notch, cmd-scroll scrub — by
    // wheelZoomFactor), else scrolls. With zoom gestures off, a zoom-wheel
    // falls through to ordinary pan (a cmd+scroll over a thumbnail rail
    // scrolls the rail).
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      if (zoomGestures && (e.ctrlKey || e.metaKey)) {
        stage.zoomAround({ x: e.clientX - r.left, y: e.clientY - r.top }, wheelZoomFactor(e));
      } else {
        const dx = e.shiftKey ? e.deltaY : e.deltaX;
        const dy = e.shiftKey ? e.deltaX : e.deltaY;
        stage.panBy(-dx, -dy);
      }
    };
    el.addEventListener('wheel', onWheel, { passive: false });

    // Safari never synthesizes ctrl+wheel for trackpad pinch — it fires
    // proprietary gesture events carrying an ABSOLUTE scale; convert to the
    // per-event ratio the camera physics wants. Feature-detected: Chrome and
    // Firefox don't have GestureEvent, so this wiring costs them nothing.
    // preventDefault runs even with zoom gestures off — a pinch over the
    // stage must never zoom the page itself.
    let lastScale = 1;
    const onGestureStart = (e: Event) => {
      e.preventDefault();
      lastScale = (e as unknown as { scale?: number }).scale ?? 1;
    };
    const onGestureChange = (e: Event) => {
      e.preventDefault();
      const g = e as unknown as { scale?: number; clientX: number; clientY: number };
      const scale = g.scale ?? 1;
      if (zoomGestures && scale > 0) {
        const r = el.getBoundingClientRect();
        stage.zoomAround({ x: g.clientX - r.left, y: g.clientY - r.top }, scale / lastScale);
      }
      lastScale = scale;
    };
    const hasGestureEvents = 'GestureEvent' in window;
    if (hasGestureEvents) {
      el.addEventListener('gesturestart', onGestureStart);
      el.addEventListener('gesturechange', onGestureChange);
      el.addEventListener('gestureend', onGestureStart); // reset the base
    }

    const cleanups: Array<() => void> = [];
    if (useHub && ix) {
      // Forward to the hub: pan/select/etc. become tool-gated handlers. `pageAt`
      // resolves the page per event, so a drag can cross pages (text selection).
      const clicks = createClickCounter();
      const forward = (phase: PointerSample['phase'], e: PointerEvent, clickCount = 1) => {
        const r = el.getBoundingClientRect();
        const vpt = { x: e.clientX - r.left, y: e.clientY - r.top };
        ix.dispatch({
          phase,
          viewport: vpt,
          page: stage.pageAt(vpt) ?? undefined,
          // Page-anchored gestures (annotation move/resize) track the origin
          // page's frame through this even when the cursor is off that page.
          project: (pon) => stage.pointOnPage(pon, vpt),
          modifiers: { shift: e.shiftKey, alt: e.altKey, ctrl: e.ctrlKey, meta: e.metaKey },
          clickCount,
        });
      };
      let dragging = false;
      const down = (e: PointerEvent) => {
        if (e.button !== 0) return;
        dragging = true;
        forward('down', e, clicks(Date.now(), e.clientX, e.clientY));
      };
      const hover = (e: PointerEvent) => {
        if (!dragging) forward('move', e); // cursor feedback, no gesture
      };
      const winMove = (e: PointerEvent) => {
        if (dragging) forward('move', e);
      };
      const up = (e: PointerEvent) => {
        if (!dragging) return;
        dragging = false;
        forward('up', e);
      };
      el.addEventListener('pointerdown', down);
      el.addEventListener('pointermove', hover);
      window.addEventListener('pointermove', winMove);
      window.addEventListener('pointerup', up);
      cleanups.push(() => {
        el.removeEventListener('pointerdown', down);
        el.removeEventListener('pointermove', hover);
        window.removeEventListener('pointermove', winMove);
        window.removeEventListener('pointerup', up);
      });
    } else {
      // Built-in drag-to-pan (no interaction hub) — unchanged behaviour.
      let dragging = false;
      let lx = 0;
      let ly = 0;
      const down = (e: PointerEvent) => {
        if (e.button !== 0) return;
        dragging = true;
        lx = e.clientX;
        ly = e.clientY;
      };
      const move = (e: PointerEvent) => {
        if (!dragging) return;
        stage.panBy(e.clientX - lx, e.clientY - ly);
        lx = e.clientX;
        ly = e.clientY;
      };
      const up = () => {
        dragging = false;
      };
      el.addEventListener('pointerdown', down);
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
      cleanups.push(() => {
        el.removeEventListener('pointerdown', down);
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
      });
    }

    return () => {
      ro.disconnect();
      mq?.removeEventListener('change', reportDpr);
      el.removeEventListener('wheel', onWheel);
      if (hasGestureEvents) {
        el.removeEventListener('gesturestart', onGestureStart);
        el.removeEventListener('gesturechange', onGestureChange);
        el.removeEventListener('gestureend', onGestureStart);
      }
      cleanups.forEach((fn) => fn());
    };
  }, [stage, ix, useHub, zoomGestures]);

  return (
    <div
      ref={ref}
      className={className}
      style={{
        position: 'relative',
        overflow: 'hidden',
        touchAction: 'none',
        ...(useHub ? { cursor: hubCursor } : null),
        ...style,
      }}
    >
      {pages.map((p) => (
        <PageSurface
          key={p.pageIndex}
          documentId={docId ?? ''}
          page={p}
          frame={frame}
          stage={stage}
          render={children}
          chrome={pageChrome}
        />
      ))}
      {/* Anchored UI mounts in the overlay: absolute coords here are the
          projector's overlay space (the stage container). */}
      <ProjectorProvider value={projectorBinding}>{overlay}</ProjectorProvider>
    </div>
  );
}

// ── Facade hooks — thin sugar over the capability + generic binding ───────────
export function useStage(token: StageTokenProp = StageToken) {
  return useCapability(token);
}
export function useZoom(token: StageTokenProp = StageToken) {
  const s = useCapability(token);
  const zoom = useSelector(token, (c) => c.zoomLevel());
  const mode = useSelector(token, (c) => c.zoomMode());
  return {
    zoom,
    /** Active zoom intent: 'automatic' | 'fit-page' | 'fit-width' | 'fit-all' | 'custom'. */
    mode,
    zoomIn: s.zoomIn,
    zoomOut: s.zoomOut,
    fitWidth: s.fitWidth,
    fitPage: s.fitPage,
    fitAll: s.fitAll,
    automatic: s.automatic,
    zoomTo: s.zoomTo,
  };
}
export function usePages(token: StageTokenProp = StageToken) {
  const s = useCapability(token);
  const currentPage = useSelector(token, (c) => c.currentPage());
  const pageCount = useSelector(token, (c) => c.pageCount());
  return {
    currentPage,
    pageCount,
    goToPage: s.goToPage,
    next: s.next,
    prev: s.prev,
    reveal: s.reveal,
  };
}
export function useLayout(token: StageTokenProp = StageToken) {
  const s = useCapability(token);
  const flow = useSelector(token, (c) => c.flow());
  const layout = useSelector(token, (c) => c.layout());
  const spread = useSelector(token, (c) => c.spread());
  const sizing = useSelector(token, (c) => c.sizing());
  const bounded = useSelector(token, (c) => c.bounded());
  return {
    flow,
    layout,
    spread,
    sizing,
    bounded,
    setFlow: s.setFlow,
    setLayout: s.setLayout,
    setSpread: s.setSpread,
    setSizing: s.setSizing,
    setBounded: s.setBounded,
  };
}

/** The document's page list (with PDF labels) + the current item's pages — the
 *  data for page thumbnails / worksheet-style page tabs. */
export function usePageList(token: StageTokenProp = StageToken) {
  const pages = useSelector(
    token,
    (c) => c.pages(),
    (a, b) =>
      a.length === b.length && a.every((p, i) => p.pon === b[i].pon && p.label === b[i].label),
  );
  const current = useSelector(
    token,
    (c) => c.currentItemPages(),
    (a, b) => a.length === b.length && a.every((x, i) => x === b[i]),
  );
  return { pages, currentItemPages: current };
}

/**
 * All Stage settings + the batch `update`. This is the seam for "presets are a
 * customer concern": keep your own `Partial<StageSettings>` objects and apply them
 * with `update(preset)` (one anchor-preserving change).
 */
export function useStageSettings(token: StageTokenProp = StageToken) {
  const s = useCapability(token);
  // settingsEqual derives from the plugin's settings registry — a new setting is
  // covered here automatically, without this package spelling out the shape.
  const settings = useSelector(token, (c) => c.settings(), settingsEqual);
  return { settings, update: s.update, reset: s.resetView };
}
