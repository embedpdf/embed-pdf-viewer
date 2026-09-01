/**
 * The React surface for @embedpdf/plugin-selection.
 *
 * <SelectionLayer> is a dumb renderer: it warms the page's geometry on mount,
 * reads the content-space highlight rects from the capability, and paints them —
 * mapping each rect through PageContext.toPixels (the same path markers use).
 * Zero pointer handling here; that's the PagePointerSource + the hub.
 *
 * The layer resolves the HOST lens (`/internal`: geometry warming, the
 * highlight handshake) — the adapter is exactly what that entry exists for.
 * `useSelection()` hands app code the PUBLIC lens only.
 */

// One-line-per-feature: registration travels with the UI.
export * from '@embedpdf/plugin-selection';
// The clipboard side effect lives in @embedpdf/web (the plugin is DOM-free);
// re-exported here so app code has one import for the whole feature.
export { copySelection } from '@embedpdf/web';
import * as React from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { textQuadEquals } from '@embedpdf/core-geometry';
import type { CapabilityToken } from '@embedpdf/core';
import {
  HANDLE_BAR,
  HANDLE_HEAD,
  HANDLE_PAD,
  SelectionToken,
  createSelectionHandleDrag,
  selectionHandleGeom,
  type SelectionHandleEndpoint,
  type SelectionHandleView,
  type SelectionMenuAnchor,
} from '@embedpdf/plugin-selection';
import { SelectionToken as SelectionHostToken } from '@embedpdf/plugin-selection/internal';
import { StageToken, type StageCapability } from '@embedpdf/plugin-stage/contract';
import {
  attachSelectionHandle,
  wireSelectionClipboard,
  type SelectionClipboardOptions,
} from '@embedpdf/web';
import { Anchored, type AnchoredPlacement } from './anchored';
import {
  shallowArray,
  useCapability,
  useKernelValue,
  useOptionalCapability,
  usePage,
  useSelector,
} from './runtime';

export interface SelectionLayerProps {
  /** Highlight colour (default: translucent blue). */
  color?: string;
}

export function SelectionLayer({ color = 'rgba(33, 150, 243, 0.35)' }: SelectionLayerProps) {
  const page = usePage();
  const selection = useCapability(SelectionHostToken);
  const segments = useSelector(
    SelectionHostToken,
    (c) => c.segmentsForPage(page.pon),
    shallowArray,
  );
  // A consumer (e.g. a markup tool drawing its own preview) can take over the
  // selection visual; when it does, we render nothing so the two never overlap.
  const visible = useSelector(SelectionHostToken, (c) => c.highlightVisible());

  // Warm this page's text geometry as soon as it's on screen, so the first
  // pointer-down can hit-test without waiting on the engine round-trip.
  // (A no-op without doc.text.select — nothing warms, nothing renders.)
  useEffect(() => {
    selection.ensurePage(page.pon);
  }, [selection, page.pon]);

  if (!visible) return null;

  return (
    <svg
      style={{
        position: 'absolute',
        inset: 0,
        width: '100%',
        height: '100%',
        overflow: 'visible',
        pointerEvents: 'none',
      }}
    >
      {segments.map((s, i) => {
        // content space → un-rotated content view px (rides the page's CSS
        // rotation). An affine map, so mapping the four corners is exact —
        // upright segments render pixel-identical to the old div-per-rect.
        const ring = [s.quad.upperStart, s.quad.upperEnd, s.quad.lowerEnd, s.quad.lowerStart].map(
          (p) => page.transform.toPixels(p),
        );
        return (
          <polygon key={i} points={ring.map((p) => `${p.x},${p.y}`).join(' ')} fill={color} />
        );
      })}
    </svg>
  );
}

/** The PUBLIC selection capability (select(), readText(), canCopy(), …) for
 *  app chrome — toolbars, context menus, automation. */
export function useSelection() {
  return useCapability(SelectionToken);
}

/** Structural equality for the selection's menu anchor — keeps the menu from
 *  re-rendering on unrelated dispatches (the capability returns a fresh
 *  object each call). */
const sameMenuAnchor = (
  a: SelectionMenuAnchor | null,
  b: SelectionMenuAnchor | null,
): boolean => {
  if (a === b) return true;
  if (!a || !b) return false;
  return (
    a.pon === b.pon &&
    a.bounds.x === b.bounds.x &&
    a.bounds.y === b.bounds.y &&
    a.bounds.width === b.bounds.width &&
    a.bounds.height === b.bounds.height
  );
};

export interface SelectionMenuProps {
  children: React.ReactNode;
  /** Gap in screen px between the selection and the menu (default 8). */
  gap?: number;
  /** Where to place the menu relative to the selection. Default 'top'. */
  placement?: AnchoredPlacement;
}

/**
 * Floats over the current TEXT selection (one anchor regardless of
 * cross-page selection; it rides the gesture's end page) — and only once the
 * selection SETTLES: hidden while `isSelecting()` (mid-drag), it appears at
 * pointer-up; programmatic selections show immediately (born settled). Works
 * under `<Stage>` (mount in the overlay slot) and `<PageView>` alike — the
 * surface provides the projection. Compose the contents from hooks:
 * `useSelection()` for copy/clear, `useAnnotation()` for
 * `markupFromSelection('highlight')`, `copySelection` for the clipboard.
 * For live-follow UI during the drag, compose `<Anchored>` with
 * `menuAnchor()` yourself — the primitive carries no policy.
 */
export function SelectionMenu({ children, gap = 8, placement = 'top' }: SelectionMenuProps) {
  const selecting = useSelector(SelectionToken, (c) => c.isSelecting());
  const anchor = useSelector(SelectionToken, (c) => c.menuAnchor(), sameMenuAnchor);
  if (selecting || !anchor) return null;
  return (
    <Anchored anchor={anchor} placement={placement} gap={gap}>
      {children}
    </Anchored>
  );
}

// ── selection handles (the touch affordance) ────────────────────────────────
//
// Policy lives out of this file, per the layering razor: the geometry and the
// drag session are `@embedpdf/plugin-selection`'s pure `handles` module (one
// source for every adapter), the native listener mechanics are
// `@embedpdf/web`'s `attachSelectionHandle` (the down-shield timing subtlety
// lives ONCE), and this component keeps what only React can do —
// subscriptions, markup, theming.

interface Endpoints {
  start: SelectionHandleEndpoint;
  end: SelectionHandleEndpoint;
}
const sameEndpoints = (a: Endpoints | null, b: Endpoints | null): boolean => {
  if (a === b) return true;
  if (!a || !b) return false;
  return (
    a.start.pon === b.start.pon &&
    a.end.pon === b.end.pon &&
    a.start.advance === b.start.advance &&
    a.end.advance === b.end.advance &&
    // corner-wise, so a boundary that ROTATES without moving its bounding box
    // still re-renders (an AABB comparison would call that "unchanged")
    textQuadEquals(a.start.glyphQuad, b.start.glyphQuad) &&
    textQuadEquals(a.end.glyphQuad, b.end.glyphQuad)
  );
};

/** The plugin's structural view over this Stage: point-exact projection in,
 *  page resolution out. (`pageRectToScreen` is the AABB projector — upright
 *  overlays only — and would collapse exactly the orientation handles need.) */
const handleView = (stage: StageCapability): SelectionHandleView => ({
  toOverlay: (pon, pt) => {
    const world = stage.pageToWorld(pon, pt);
    return world ? stage.toScreen(world) : null;
  },
  pageAt: (overlay) => stage.pageAt(overlay),
  pointOnPage: (pon, overlay) => stage.pointOnPage(pon, overlay),
});

export interface SelectionHandlesProps {
  /** Handle colour (default: the selection blue). */
  color?: string;
  /** The stage lens hosting this overlay (default: the main StageToken). */
  token?: CapabilityToken<StageCapability>;
}

/**
 * iOS-style draggable selection handles. Each is drawn the way the platform
 * draws them: a thin caret BAR that forms the selection's own start/end edge
 * — the boundary glyph's oriented edge, so rotated text and rotated pages
 * carry the handle with them — capped by a screen-constant circle, above the
 * first line at the start, below the last line at the end.
 *
 * On touch, where a caret drag isn't available, the handles ARE the way to
 * grow or shrink a selection: a long-press selects a word, then each handle
 * extends from the OPPOSITE endpoint, snapping to glyphs and crossing pages
 * exactly like a pointer drag — it rides the same `beginAt`/`extendTo`
 * gesture path, so highlights, menus, and commit signals all behave
 * identically. Mount in the `<Stage>` overlay slot next to `<SelectionMenu>`;
 * outside a Stage it renders nothing (a `PageView` has no camera to project
 * through). Pointer-isolated, so grabbing a handle never pans the stage.
 */
export function SelectionHandles({ color = '#2196f3', token = StageToken }: SelectionHandlesProps) {
  const host = useCapability(SelectionHostToken);
  const stage = useOptionalCapability(token);
  const selecting = useSelector(SelectionToken, (c) => c.isSelecting());
  const visible = useSelector(SelectionHostToken, (c) => c.highlightVisible());
  const endpoints = useSelector(
    SelectionHostToken,
    (c): Endpoints | null => {
      const s = c.snapshot();
      if (!s.start || !s.end) return null;
      return {
        start: { pon: s.start.pon, glyphQuad: s.start.glyphQuad, advance: s.start.advance },
        end: { pon: s.end.pon, glyphQuad: s.end.glyphQuad, advance: s.end.advance },
      };
    },
    sameEndpoints,
  );
  // The handles are positioned by PROJECTING the endpoint corners through the
  // camera, so they must re-render whenever the camera moves — visiblePages is
  // the stage's reference-stable revision for exactly that (the same value the
  // page surfaces re-render on, so handle and highlight move in one commit).
  useKernelValue(() => stage?.visiblePages() ?? null);
  const [dragging, setDragging] = useState<'start' | 'end' | null>(null);
  // The web binder's `arm` must read the CURRENT endpoints/stage at pointer
  // down, not the ones captured when the listener attached — a stable ref
  // callback with a live arm-source is the standard escape from that.
  const armSource = useRef<{ stage: StageCapability; endpoints: Endpoints } | null>(null);
  armSource.current = stage && endpoints ? { stage, endpoints } : null;
  const bindHandle = useMemo(() => {
    const detach: Partial<Record<'start' | 'end', () => void>> = {};
    const make = (role: 'start' | 'end') => (el: HTMLDivElement | null) => {
      detach[role]?.();
      delete detach[role];
      if (!el) return;
      detach[role] = attachSelectionHandle(el, {
        arm: () => {
          const src = armSource.current;
          if (!src) return null;
          const view = handleView(src.stage);
          const geom = selectionHandleGeom(view, src.endpoints[role], role);
          if (!geom) return null;
          const opposite = src.endpoints[role === 'start' ? 'end' : 'start'];
          const drag = createSelectionHandleDrag(
            host,
            view,
            opposite,
            src.endpoints[role].pon,
          );
          setDragging(role);
          return {
            // the point the user grabbed: the bar's midpoint
            base: {
              x: (geom.bar.from.x + geom.bar.to.x) / 2,
              y: (geom.bar.from.y + geom.bar.to.y) / 2,
            },
            session: {
              move: drag.move,
              end: () => {
                drag.end(); // settle → menu reappears, onCommit fires
                setDragging(null);
              },
            },
          };
        },
      });
    };
    return { start: make('start'), end: make('end') };
  }, [host]);

  if (!stage || !endpoints || !visible) return null;
  // Hidden while a pointer drag-select is in flight (like the menu) — but a
  // HANDLE drag is itself a selection gesture, so it keeps its handles.
  if (selecting && !dragging) return null;
  const view = handleView(stage);

  const renderHandle = (role: 'start' | 'end') => {
    const geom = selectionHandleGeom(view, endpoints[role], role);
    if (!geom) return null; // endpoint page not laid out right now
    // The shell is laid out UPRIGHT in its own frame — bar of the edge's
    // length, head stacked above (start) or below (end) — then rotated onto
    // the projected edge. The pivot is the bar's ascent-side tip, the one
    // point that must land exactly on the glyph corner.
    const barTop = HANDLE_PAD + (role === 'start' ? HANDLE_HEAD : 0);
    const pivotX = HANDLE_PAD + HANDLE_BAR / 2;
    return (
      <div
        key={role}
        ref={bindHandle[role]}
        style={{
          position: 'absolute',
          left: geom.bar.from.x - pivotX,
          top: geom.bar.from.y - barTop,
          width: HANDLE_BAR + 2 * HANDLE_PAD,
          height: geom.length + HANDLE_HEAD + 2 * HANDLE_PAD,
          // Upright text carries NO transform — pixel-identical to an
          // axis-aligned box (the geometry's float-noise guard decides).
          ...(geom.upright
            ? null
            : {
                transform: `rotate(${geom.rotation}deg)`,
                transformOrigin: `${pivotX}px ${barTop}px`,
              }),
          touchAction: 'none',
          cursor: 'grab',
          pointerEvents: 'auto',
        }}
      >
        {/* the caret bar — the selection's own edge, spanning the glyph's ink
            height (which is why it stays the text's height at any tilt) */}
        <div
          style={{
            position: 'absolute',
            left: HANDLE_PAD,
            top: barTop,
            width: HANDLE_BAR,
            height: geom.length,
            background: color,
            borderRadius: HANDLE_BAR / 2,
          }}
        />
        {/* the head — flush against the bar, beyond the ascent at the start and
            past the baseline at the end, in the TEXT's frame */}
        <div
          style={{
            position: 'absolute',
            left: pivotX - HANDLE_HEAD / 2,
            top: role === 'start' ? HANDLE_PAD : HANDLE_PAD + geom.length,
            width: HANDLE_HEAD,
            height: HANDLE_HEAD,
            borderRadius: '50%',
            background: color,
            boxShadow: '0 1px 4px rgba(0, 0, 0, 0.35)',
          }}
        />
      </div>
    );
  };

  return (
    <>
      {renderHandle('start')}
      {renderHandle('end')}
    </>
  );
}


export type SelectionClipboardProps = Pick<SelectionClipboardOptions, 'prefetch'>;

/**
 * Mount ONCE per viewer to wire clipboard copy: prefetches the selected text
 * when the selection settles, answers the native `copy` event synchronously,
 * and falls back to the async Clipboard API for ctrl/cmd+C when the page has
 * no DOM selection. Renders nothing. For a toolbar Copy button, call
 * `copySelection(useSelection())` from its click handler instead.
 */
export function SelectionClipboard({ prefetch }: SelectionClipboardProps = {}) {
  const selection = useCapability(SelectionToken);
  useEffect(
    () => wireSelectionClipboard(selection, prefetch === undefined ? {} : { prefetch }),
    [selection, prefetch],
  );
  return null;
}
