/**
 * Stage surface binding — everything DOM about attaching one element to one
 * stage lens, shared by every framework adapter (React, Angular, …) so the
 * binding can never drift between them:
 *
 *   • ResizeObserver → `setViewport` (the shell only reports; placement is the
 *     stage plugin's job)
 *   • device-pixel-ratio observation → `setDevicePixelRatio` (dppx changes
 *     re-subscribe, since the media query's value itself moves)
 *   • pointer-sample normalization — the ONE place a PointerEvent becomes a
 *     page-resolved, source-stamped sample for the interaction hub
 *   • the gesture controller (wheel, Safari trackpad gestures, synthesized
 *     touch physics) from `./stage-gestures`
 *
 * The framework adapters keep only their reactive glue: refs/effects, page
 * surfaces, cursor-style subscription, overlay slots.
 *
 * Dependency note: like the gesture controller, this module speaks to the
 * stage and the hub through STRUCTURAL interfaces ({@link StageSurfaceHost},
 * {@link StageSurfaceHub}) — satisfied by `StageCapability` and
 * `InteractionCapability`, imported by neither. @embedpdf/web stays free of
 * plugin imports, per the layering law.
 *
 * Browser-only by nature (ResizeObserver, matchMedia): call from a mounted
 * effect / browser platform check, exactly like the gesture controller.
 */
import { createStageGestureController } from './stage-gestures';
import type { StageGestureHost, StageGestureSink, StageWheelSample } from './stage-gestures';

interface SurfacePoint {
  x: number;
  y: number;
}

/** What the binding needs from the stage — `StageCapability` satisfies it. */
export interface StageSurfaceHost extends StageGestureHost {
  setViewport(size: { width: number; height: number }): void;
  setDevicePixelRatio(ratio: number): void;
  /** Viewport point → the page under it (with per-page display context), or null over a gap. */
  pageAt(screen: SurfacePoint): {
    pon: number;
    point: SurfacePoint;
    scale?: number;
    rotation?: 0 | 90 | 180 | 270;
    zoom?: number;
  } | null;
  /** Viewport point → a SPECIFIC page's content space, unclamped (frame-stable projection). */
  pointOnPage(pon: number, screen: SurfacePoint): SurfacePoint | null;
}

/**
 * The page-resolved sample the binding hands the hub — structurally a
 * `PointerSample` (plugin-interaction). `source` carries the lens identity so
 * the hub can route lens-scoped handlers; with several stages on one document,
 * a drag on one lens must never be captured by another lens's handler.
 */
export interface StageSurfaceSample {
  phase: 'down' | 'move' | 'up' | 'cancel';
  viewport: SurfacePoint;
  page?: {
    pon: number;
    point: SurfacePoint;
    scale?: number;
    rotation?: 0 | 90 | 180 | 270;
    zoom?: number;
  };
  project: (pon: number) => SurfacePoint | null;
  modifiers: { shift: boolean; alt: boolean; ctrl: boolean; meta: boolean };
  clickCount: number;
  pointerType: 'mouse' | 'pen' | 'touch';
  gesture?: 'long-press';
  source?: string;
}

/** What the binding needs from the interaction hub — `InteractionCapability` satisfies it. */
export interface StageSurfaceHub {
  dispatch(sample: StageSurfaceSample): void;
  activeTool(): { touchDirect?: boolean };
  wouldClaimTouch(sample: StageSurfaceSample): boolean;
}

export interface StageSurfaceOptions {
  /** Route pointer input to the interaction hub (page-resolved samples) instead
   *  of built-in drag-to-pan. Omit/null for a hub-less stage. */
  hub?: StageSurfaceHub | null;
  /** The lens identity stamped on every sample (`StageCapability.lensId()`),
   *  so lens-scoped handlers only see their own stage's input. */
  source?: string;
  /** Ambient zoom gestures (see {@link StageGestureOptions}). Default true. */
  zoomGestures?: boolean;
  /** Override the wheel → zoom-factor classifier (defaults to `./wheel`). */
  wheelZoomFactor?: (sample: StageWheelSample) => number;
}

/** Attach the full surface binding. Returns the detach fn. */
export function createStageSurface(
  el: HTMLElement,
  stage: StageSurfaceHost,
  options: StageSurfaceOptions = {},
): () => void {
  const hub = options.hub ?? null;
  const cleanups: Array<() => void> = [];

  // Only report the viewport size. Initial placement (home) is the stage
  // plugin's job — it places when it first learns a real size (and a
  // higher-priority initial-view provider can override). The shell stays dumb.
  const setViewport = () => stage.setViewport({ width: el.clientWidth, height: el.clientHeight });
  const ro = new ResizeObserver(setViewport);
  ro.observe(el);
  setViewport();
  cleanups.push(() => ro.disconnect());

  // Report the device pixel ratio so page transforms render crisp. dppx changes
  // (browser zoom, dragging between monitors) fire the media query;
  // re-subscribe each time since the query value itself moves.
  let mq: MediaQueryList | null = null;
  const reportDpr = () => {
    stage.setDevicePixelRatio(window.devicePixelRatio || 1);
    mq?.removeEventListener('change', reportDpr);
    mq = window.matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`);
    mq.addEventListener('change', reportDpr);
  };
  reportDpr();
  cleanups.push(() => mq?.removeEventListener('change', reportDpr));

  // The sink is the hub bridge: it converts events to page-resolved samples
  // (`pageAt` per event, so a drag can cross pages) and stamps the lens source.
  const sampleOf = (
    phase: StageSurfaceSample['phase'],
    e: PointerEvent,
    clickCount = 1,
    gesture?: StageSurfaceSample['gesture'],
  ): StageSurfaceSample => {
    const r = el.getBoundingClientRect();
    const viewport = { x: e.clientX - r.left, y: e.clientY - r.top };
    return {
      phase,
      viewport,
      page: stage.pageAt(viewport) ?? undefined,
      // Page-anchored gestures (annotation move/resize) track the origin
      // page's frame through this even when the cursor is off that page.
      project: (pon) => stage.pointOnPage(pon, viewport),
      modifiers: { shift: e.shiftKey, alt: e.altKey, ctrl: e.ctrlKey, meta: e.metaKey },
      clickCount,
      pointerType: (e.pointerType || 'mouse') as StageSurfaceSample['pointerType'],
      ...(gesture ? { gesture } : {}),
      ...(options.source ? { source: options.source } : {}),
    };
  };
  const forward = (
    phase: StageSurfaceSample['phase'],
    e: PointerEvent,
    clickCount = 1,
    gesture?: StageSurfaceSample['gesture'],
  ) => {
    hub?.dispatch(sampleOf(phase, e, clickCount, gesture));
  };
  const sink: StageGestureSink | null = hub
    ? {
        down: (e, clickCount) => forward('down', e, clickCount),
        move: (e) => forward('move', e),
        up: (e) => forward('up', e),
        cancel: (e) => forward('cancel', e),
        hover: (e) => forward('move', e), // no owner → the hub routes to onHover
        // Touch long-press = a word-select down (clickCount 2 keeps the
        // word-selection contract; the `gesture` marker is the honest
        // long-press signal for haptics/pickup handlers).
        longPress: (e) => forward('down', e, 2, 'long-press'),
        // Touch consent: an armed drawing/markup tool takes fingers wholesale;
        // otherwise per-point claims (a selected annotation's body or handles)
        // decide. A pure pre-flight — nothing captures.
        claimsPoint: (e) =>
          !!hub.activeTool().touchDirect || hub.wouldClaimTouch(sampleOf('down', e)),
      }
    : null;
  cleanups.push(
    createStageGestureController(el, stage, {
      zoomGestures: options.zoomGestures,
      wheelZoomFactor: options.wheelZoomFactor,
      sink,
    }),
  );

  return () => {
    for (const fn of cleanups) fn();
  };
}
