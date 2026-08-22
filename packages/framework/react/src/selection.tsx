/**
 * The React surface for @embedpdf/plugin-selection.
 *
 * <SelectionLayer> is a dumb renderer: it warms the page's geometry on mount,
 * reads the content-space highlight rects from the capability, and paints them —
 * mapping each rect through PageContext.pageToContent (the same path markers use).
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
import { useEffect, useRef, useState } from 'react';
import type { Rect } from '@embedpdf/core-geometry';
import type { CapabilityToken, PageObjectNumber } from '@embedpdf/core';
import { SelectionToken, type SelectionMenuAnchor } from '@embedpdf/plugin-selection';
import { SelectionToken as SelectionHostToken } from '@embedpdf/plugin-selection/internal';
import { StageToken, type StageCapability } from '@embedpdf/plugin-stage';
import { wireSelectionClipboard, type SelectionClipboardOptions } from '@embedpdf/web';
import { Anchored, type AnchoredPlacement } from './anchored';
import { shallowArray, useCapability, useOptionalCapability, usePage, useSelector } from './runtime';

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
          (p) => page.transform.pageToContent(p),
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

interface Endpoint {
  pon: PageObjectNumber;
  rect: Rect;
}
interface Endpoints {
  start: Endpoint;
  end: Endpoint;
}
const sameRect = (a: Rect, b: Rect) =>
  a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height;
const sameEndpoints = (a: Endpoints | null, b: Endpoints | null): boolean => {
  if (a === b) return true;
  if (!a || !b) return false;
  return (
    a.start.pon === b.start.pon &&
    a.end.pon === b.end.pon &&
    sameRect(a.start.rect, b.start.rect) &&
    sameRect(a.end.rect, b.end.rect)
  );
};
const rectCenter = (r: Rect) => ({ x: r.x + r.width / 2, y: r.y + r.height / 2 });

export interface SelectionHandlesProps {
  /** Handle colour (default: the selection blue). */
  color?: string;
  /** The stage lens hosting this overlay (default: the main StageToken). */
  token?: CapabilityToken<StageCapability>;
}

/**
 * iOS-style draggable selection handles — the two "lollipops" at the start and
 * end of the text selection. On touch, where a caret drag isn't available,
 * they ARE the way to grow or shrink a selection: a long-press selects a word,
 * then each handle extends from the OPPOSITE endpoint (drag the end handle and
 * the start stays anchored, and vice versa), snapping to glyphs and crossing
 * pages exactly like a pointer drag — it rides the same `beginAt`/`extendTo`
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
        start: { pon: s.start.pon, rect: s.start.rect },
        end: { pon: s.end.pon, rect: s.end.rect },
      };
    },
    sameEndpoints,
  );
  const [dragging, setDragging] = useState<'start' | 'end' | null>(null);
  const drag = useRef<{
    baseVpt: { x: number; y: number };
    baseClient: { x: number; y: number };
    anchorPon: PageObjectNumber;
    anchorPoint: { x: number; y: number };
    begun: boolean;
    lastPon: PageObjectNumber;
  } | null>(null);

  if (!stage || !endpoints || !visible) return null;
  // Hidden while a pointer drag-select is in flight (like the menu) — but a
  // HANDLE drag is itself a selection gesture, so it keeps its handles.
  if (selecting && !dragging) return null;

  const startDrag = (role: 'start' | 'end') => (e: React.PointerEvent) => {
    const dragged = endpoints[role];
    const opposite = endpoints[role === 'start' ? 'end' : 'start'];
    const screen = stage.pageRectToScreen(dragged.pon, dragged.rect);
    if (!screen) return;
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = {
      // Track by DELTAS from the endpoint's own screen position — no DOM
      // geometry reads, and client↔viewport conversion cancels out.
      baseVpt: { x: screen.x + screen.width / 2, y: screen.y + screen.height / 2 },
      baseClient: { x: e.clientX, y: e.clientY },
      anchorPon: opposite.pon,
      anchorPoint: rectCenter(opposite.rect),
      begun: false,
      lastPon: dragged.pon,
    };
    setDragging(role);
  };
  const moveDrag = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const vpt = {
      x: d.baseVpt.x + (e.clientX - d.baseClient.x),
      y: d.baseVpt.y + (e.clientY - d.baseClient.y),
    };
    if (!d.begun) {
      // Re-root the drag gesture at the FIXED endpoint; every move then
      // extends toward the finger — the pointer-drag path, re-anchored.
      if (!host.beginAt(d.anchorPon, d.anchorPoint)) return;
      d.begun = true;
    }
    const hit = stage.pageAt(vpt);
    if (hit) {
      d.lastPon = hit.pon;
      host.extendTo(hit.pon, hit.point);
    } else {
      // Over a gap: project onto the last page's plane (unclamped) so the
      // selection keeps tracking instead of freezing at the page edge.
      const p = stage.pointOnPage(d.lastPon, vpt);
      if (p) host.extendTo(d.lastPon, p);
    }
  };
  const endDrag = () => {
    if (!drag.current) return;
    const begun = drag.current.begun;
    drag.current = null;
    setDragging(null);
    if (begun) host.end(); // settle → menu reappears, onCommit fires
  };

  const lollipop = (role: 'start' | 'end') => {
    const head = (
      <div
        style={{
          width: 12,
          height: 12,
          borderRadius: '50%',
          background: color,
          boxShadow: '0 1px 4px rgba(0, 0, 0, 0.35)',
        }}
      />
    );
    const stem = <div style={{ width: 2, height: 14, background: color }} />;
    return (
      <Anchored
        anchor={{ pon: endpoints[role].pon, bounds: endpoints[role].rect }}
        placement={role === 'start' ? 'top' : 'bottom'}
        gap={-4}
      >
        <div
          onPointerDown={startDrag(role)}
          onPointerMove={moveDrag}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            // a finger-sized hit target around a 12px head
            padding: '10px 14px',
            touchAction: 'none',
            cursor: 'grab',
          }}
        >
          {role === 'start' ? head : stem}
          {role === 'start' ? stem : head}
        </div>
      </Anchored>
    );
  };

  return (
    <>
      {lollipop('start')}
      {lollipop('end')}
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
