/**
 * Stage / RenderLayer + facade hooks.
 *
 * <Stage> virtualizes and positions page surfaces by the camera, and hands each
 * one to your render prop — you bring the layers. (The standalone, Stage-free
 * single-page surface lives in `./page-view` so it never pulls the stage plugin.)
 */

// One-line-per-feature: registration travels with the UI.
export * from '@embedpdf/plugin-stage';
import * as React from 'react';
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { createScrollHandler, settingsEqual } from '@embedpdf/plugin-stage';
import type { StageCapability, VisiblePage } from '@embedpdf/plugin-stage';
import type { StageHostCapability } from '@embedpdf/plugin-stage/contract/host';
import { toPageRef } from '@embedpdf/core';
import type { CapabilityToken, EventHook } from '@embedpdf/core';
import type { PageFrame } from '@embedpdf/core-geometry';
import { InteractionToken as InteractionPublicToken } from '@embedpdf/plugin-interaction/contract';
import { InteractionToken } from '@embedpdf/plugin-interaction/contract/host';
import { createStageSurface } from '@embedpdf/web';
import { ProjectorProvider, type ProjectorBinding, type ViewProjector } from './anchored';
import {
  makePageContext,
  PageProvider,
  useCapability,
  useCapabilityEvent,
  useDocumentId,
  useKernelValue,
  useOptionalCapability,
  useSelector,
} from './runtime';
import type { PageContextValue } from './runtime';
import { StageScope, useStageToken } from './stage-scope';
import type { StageTokenProp } from './stage-scope';

export { StageScope, useStageToken } from './stage-scope';
export type { StageScopeProps, StageTokenProp } from './stage-scope';

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
  /** The stage capability — the demand getter reads visibility live off it. */
  stage: StageHostCapability;
  render: (page: PageContextValue) => React.ReactNode;
  chrome?: (page: PageContextValue) => React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const transform = page.transform;
  const rotation = page.rotation;
  // All geometry comes from the transform: the display footprint (viewWidth/Height,
  // already w↔h-swapped + device-snapped) and the un-rotated content box
  // (contentWidth/Height). The shell never re-derives `* zoom` / `* dpr` / snapping.
  const outerW = transform.viewWidth + frame.left + frame.right;
  const outerH = transform.viewHeight + frame.top + frame.bottom;
  // page.screenX/screenY are the device-snapped footprint top-left; the outer box
  // sits one frame further out so the content keeps its scene position.
  const left = page.screenX - frame.left;
  const top = page.screenY - frame.top;
  // Center the (possibly rotated) content box on the display box and rotate about
  // its center — no translate(), so rotation 0 carries no transform and pixel-snaps
  // like the axis-aligned shadow behind it (no hairline seam).
  const contentLeft = frame.left + (transform.viewWidth - transform.contentWidth) / 2;
  const contentTop = frame.top + (transform.viewHeight - transform.contentHeight) / 2;
  // The page address this surface hands its layers. The stage rebuilds
  // `VisiblePage.ref` every camera frame, so it is memoized by the number:
  // identity-stable per page, safe for layers to key effects on.
  const pageObjectNumber = page.ref.pageObjectNumber;
  const pageRef = useMemo(() => toPageRef(pageObjectNumber), [pageObjectNumber]);
  // The page-view demand is a pull: the getter closes over
  // stable references (capability + page address) and reads the stage's live state at
  // call time — visibility is the stage's data (`VisiblePage.visibleRect`),
  // not something an adapter re-derives or caches. Absent from the visible
  // set = zero rect ("want nothing"), distinct from PageView's undefined
  // getter ("whole page").
  const ctx = useMemo(
    () =>
      makePageContext(
        documentId,
        // the hosting lens — per-view raster planning keys tile state by it,
        // so a thumbnail rail and the main view never fight over one plan
        stage.getLensId(),
        pageRef,
        page.pageIndex,
        frame,
        transform,
        () => ref.current!.getBoundingClientRect(),
        () => {
          const live = stage
            .listVisiblePages()
            .find((visiblePage) => visiblePage.ref.pageObjectNumber === pageObjectNumber);
          return live
            ? { desiredDeviceWidth: live.transform.deviceWidth, visibleRect: live.visibleRect }
            : {
                desiredDeviceWidth: transform.deviceWidth,
                visibleRect: { x: 0, y: 0, width: 0, height: 0 },
              };
        },
      ),
    [documentId, pageRef, pageObjectNumber, page.pageIndex, frame, transform, stage],
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
            width: transform.viewWidth,
            height: transform.viewHeight,
            // themeable: override via the CSS variable (app stylesheet), no props
            boxShadow: 'var(--epdf-page-shadow, 0 6px 18px rgba(0,0,0,.18))',
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
            width: transform.contentWidth,
            height: transform.contentHeight,
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
   * Page-space content for each visible page (RenderLayer, annotations,
   * markers). Rendered inside the page's content frame, so it rotates with the
   * page's display rotation — coordinates are plain PDF points.
   */
  children: (page: PageContextValue) => React.ReactNode;
  /**
   * Box-space chrome for each visible page (page-number label, selection
   * border, a per-page rotate/delete button). Rendered into the outer box
   * (content + reserved `pageFrame`), so it does not rotate and the reserved
   * bands are plain regions (`bottom:0; height: page.frame.bottom`). The three
   * coordinate spaces: `children` (page content), `pageChrome` (page box +
   * frame), `overlay` (viewport).
   */
  pageChrome?: (page: PageContextValue) => React.ReactNode;
  /** Viewport-space UI (menus, controls) rendered above the pages. */
  overlay?: React.ReactNode;
  /**
   * Route this Stage's pointer events to the interaction hub (page-resolved via
   * `pageAt`) — and register this lens's tool-gated pan-scroll handler with it
   * (lens-scoped, so multiple stages on one document never pan each other).
   * Pan is then the `pan` tool's job and dragging in `pointer` mode selects
   * text (incl. across pages).
   *
   * Default true: registering `interactionPlugin()` is the one opt-in — tools
   * just work; without the hub this is inert and the stage falls back to
   * built-in drag-to-pan, so a hub-less setup costs nothing. Set `false` on
   * secondary lenses (a thumbnail rail) that should stay click-to-navigate
   * instead of feeding the document's tools.
   */
  interaction?: boolean;
  /**
   * With {@link interaction}: let drags over page gaps pan regardless of the
   * active tool (and show a grab cursor there) — the gutter always pans; there
   * is nothing to draw/select outside a page. Default true.
   */
  panFallback?: boolean;
  /**
   * Ambient zoom gestures on this stage: ctrl/cmd+wheel and trackpad pinch
   * (Safari gesture events included). Default true. Turn off for follower
   * lenses with a fixed magnification — a thumbnail rail should scroll under
   * cmd+wheel, not zoom — so a zoom-wheel falls through to ordinary wheel
   * pan, and pinches are still swallowed (they never page-zoom the browser).
   */
  zoomGestures?: boolean;
  /**
   * The controlled form of the active tool: while set, the interaction hub's
   * active tool follows this value (re-applied when the document changes),
   * and `onToolChange` reports every change so the owner can update it. Omit
   * both for the uncontrolled default (`useTool().activate`).
   */
  tool?: string;
  /** Fires on every tool change of this stage's document (controlled or not). */
  onToolChange?: (toolId: string) => void;
  /** The stage lens to drive (default: the nearest `<StageScope>`, else the main StageToken). */
  token?: StageTokenProp;
  className?: string;
  style?: React.CSSProperties;
}

export function Stage({
  children,
  pageChrome,
  overlay,
  interaction = true,
  panFallback = true,
  zoomGestures = true,
  tool,
  onToolChange,
  token: explicitToken,
  className,
  style,
}: StageProps) {
  const token = useStageToken(explicitToken);
  // The surface is a host of the lens: it reports viewport size, drives gestures and
  // reads the lens id. The host contract is the same runtime token, typed wider.
  const stage = useCapability(token as unknown as CapabilityToken<StageHostCapability>);
  const ix = useOptionalCapability(InteractionToken);
  // Controlled tool: the prop is the source of truth whenever it is set.
  useEffect(() => {
    if (tool === undefined || !ix) return;
    if (ix.getActiveToolId() !== tool) ix.activateTool(tool);
  }, [tool, ix]);
  useCapabilityEvent(
    InteractionPublicToken,
    (interaction) => interaction.onToolChanged,
    (event) => onToolChange?.(event.toolId),
  );
  const useHub = interaction && !!ix;
  // The hub's resolved cursor (text/grab/…), applied to the viewport when driving.
  const hubCursor = useKernelValue(() => ix?.getCursor() ?? 'default');
  const ref = useRef<HTMLDivElement>(null);
  const docId = useDocumentId();
  // visiblePages already folds in the camera (each page carries its device-snapped
  // screenX/screenY + transform), so panning re-emits the list — no separate
  // camera subscription needed for positioning.
  const pages = useSelector(token, (stage) => stage.listVisiblePages()); // memoized -> stable ref
  // Reserved chrome bands (screen px), uniform across pages — the frame the
  // outer box reserves and `pageChrome` paints into.
  const frame = useSelector(
    token,
    (stage) => stage.getSettings().pageFrame,
    (left, right) =>
      left.top === right.top &&
      left.right === right.right &&
      left.bottom === right.bottom &&
      left.left === right.left,
  );

  // The Stage's ViewProjector: anchored UI (menus, popovers) positions through
  // the camera — pure state, no DOM reads, no portal, and no subscription:
  // `pages` (visiblePages) is the binding's revision, so a camera change
  // re-renders the pages and every anchored consumer in the same React
  // commit — surface and overlay can never paint a frame apart.
  const projector = useMemo<ViewProjector>(
    () => ({
      space: 'overlay',
      toScreen: (page, rect) => stage.pageRectToViewport(page, rect),
      toScreenPoint: (page, at) => {
        const rect = stage.pageRectToViewport(page, { x: at.x, y: at.y, width: 0, height: 0 });
        return rect ? { x: rect.x, y: rect.y } : null;
      },
      viewEnv: (page) => {
        const transform = stage.getPageFrame(page)?.transform;
        return transform
          ? { scale: transform.viewScale, rotation: transform.rotation, zoom: transform.zoom }
          : null;
      },
    }),
    [stage],
  );
  const projectorBinding = useMemo<ProjectorBinding>(
    () => ({ projector, revision: pages }),
    [projector, pages],
  );

  useLayoutEffect(() => {
    const element = ref.current!;
    // The whole browser binding — viewport/DPR reporting, sample normalization,
    // gesture controller — is the shared @embedpdf/web surface, so every
    // framework adapter has one feel. This component keeps only React glue.
    const detachSurface = createStageSurface(element, stage, {
      hub: useHub ? ix : null,
      source: stage.getLensId(),
      zoomGestures,
    });
    // Interaction opt-in lives with the sample source: the same knob that
    // forwards this lens's samples also registers its pan-scroll handler,
    // lens-scoped — two stages on one document can never pan each other.
    const offScroll =
      useHub && ix
        ? ix.registerHandler(createScrollHandler(stage, ix, { panFallback }), {
            source: stage.getLensId(),
          })
        : null;

    return () => {
      offScroll?.();
      detachSurface();
    };
  }, [stage, ix, useHub, zoomGestures, panFallback]);

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
      {/* Everything inside binds to THIS lens by default: a `useZoom()` in a
          page's chrome or a `<SelectionHandles>` in the overlay needs no token. */}
      <StageScope token={token}>
        {pages.map((visiblePage) => (
          <PageSurface
            key={visiblePage.ref.pageObjectNumber} // durable page identity — survives move/delete (matches Angular's `track visiblePage.ref.pageObjectNumber`)
            documentId={docId ?? ''}
            page={visiblePage}
            frame={frame}
            stage={stage}
            render={children}
            chrome={pageChrome}
          />
        ))}
        {/* Anchored UI mounts in the overlay: absolute coords here are the
            projector's overlay space (the stage container). */}
        <ProjectorProvider value={projectorBinding}>{overlay}</ProjectorProvider>
      </StageScope>
    </div>
  );
}

// ── Facade hooks — thin sugar over the capability + generic binding ───────────
// Every hook takes an optional token; without one it binds to the nearest
// `<StageScope>` / `<Stage>`, else the main lens.
export function useStage(token?: StageTokenProp) {
  return useCapability(useStageToken(token));
}
/** Subscribe to one stage event for the mounted lifetime: `useStageEvent((stage) => stage.onZoomChanged, handler)`. */
export function useStageEvent<T>(
  select: (stage: StageCapability) => EventHook<T>,
  handler: (event: T) => void,
  token?: StageTokenProp,
): void {
  useCapabilityEvent(useStageToken(token), select, handler);
}
export function useZoom(explicitToken?: StageTokenProp) {
  const token = useStageToken(explicitToken);
  const stage = useCapability(token);
  const zoom = useSelector(token, (stage) => stage.getZoomLevel());
  const mode = useSelector(token, (stage) => stage.getZoomMode());
  return {
    zoom,
    /** Active zoom intent: 'automatic' | 'fit-page' | 'fit-width' | 'fit-all' | 'custom'. */
    mode,
    zoomIn: stage.zoomIn,
    zoomOut: stage.zoomOut,
    fitWidth: stage.fitWidth,
    fitPage: stage.fitPage,
    fitAll: stage.fitAll,
    automatic: stage.fitAutomatic,
    zoomTo: stage.zoomTo,
  };
}
export function usePages(explicitToken?: StageTokenProp) {
  const token = useStageToken(explicitToken);
  const stage = useCapability(token);
  const currentPage = useSelector(token, (stage) => stage.getCurrentPageIndex());
  const documentId = useDocumentId();
  const pageCount = useKernelValue(
    (kernel) => kernel.documents.listPages(documentId ?? undefined).length,
  );
  return {
    currentPage,
    pageCount,
    goToPage: stage.goToPageIndex,
    next: stage.nextPage,
    previous: stage.previousPage,
    reveal: stage.revealIndex,
  };
}
export function useLayout(explicitToken?: StageTokenProp) {
  const token = useStageToken(explicitToken);
  const stage = useCapability(token);
  const flow = useSelector(token, (stage) => stage.getSettings().flow);
  const layout = useSelector(token, (stage) => stage.getSettings().layout);
  const spread = useSelector(token, (stage) => stage.getSettings().spread);
  const sizing = useSelector(token, (stage) => stage.getSettings().sizing);
  const bounded = useSelector(token, (stage) => stage.getSettings().bounded);
  return {
    flow,
    layout,
    spread,
    sizing,
    bounded,
    setFlow: stage.setFlow,
    setLayout: stage.setLayout,
    setSpread: stage.setSpread,
    setSizing: stage.setSizing,
    setBounded: (bounded: boolean) => stage.updateSettings({ bounded }),
  };
}

/** The document's page list (with PDF labels) + the current item's pages — the
 *  data for page thumbnails / worksheet-style page tabs. */
export function usePageList(explicitToken?: StageTokenProp) {
  const token = useStageToken(explicitToken);
  const documentId = useDocumentId();
  // The page list is document truth (order, labels, sizes), so it comes from the
  // kernel's page registry; Stage only knows which of those pages it is showing.
  const pages = useKernelValue(
    (kernel) => kernel.documents.listPages(documentId ?? undefined),
    (left, right) =>
      left.length === right.length &&
      left.every(
        (pageInfo, i) =>
          pageInfo.ref.pageObjectNumber === right[i].ref.pageObjectNumber &&
          pageInfo.label === right[i].label,
      ),
  );
  const current = useSelector(
    token,
    (stage) => stage.listCurrentItemPages().map((pageInfo) => pageInfo.index),
    (left, right) =>
      left.length === right.length && left.every((pageIndex, i) => pageIndex === right[i]),
  );
  return { pages, currentItemPages: current };
}

/**
 * All Stage settings + the batch `update`. This is the seam for "presets are a
 * customer concern": keep your own `Partial<StageSettings>` objects and apply them
 * with `update(preset)` (one anchor-preserving change).
 */
export function useStageSettings(explicitToken?: StageTokenProp) {
  const token = useStageToken(explicitToken);
  const stage = useCapability(token);
  // settingsEqual derives from the plugin's settings registry — a new setting is
  // covered here automatically, without this package spelling out the shape.
  const settings = useSelector(token, (stage) => stage.getSettings(), settingsEqual);
  return { settings, update: stage.updateSettings, reset: stage.resetSettings };
}
