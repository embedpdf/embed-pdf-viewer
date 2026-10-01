/**
 * The React surface for @embedpdf/plugin-selection.
 *
 * <SelectionLayer> is a dumb renderer: it warms the page's geometry on mount,
 * reads the page-space highlight rects from the capability, and paints them —
 * mapping each rect through PageContext.toPixels (the same path markers use),
 * in the plugin's `color` setting, which the `--epdf-text-selection` CSS
 * variable overrides. Zero pointer handling here; that's the
 * PagePointerSource + the hub.
 *
 * The layer resolves the host lens (`/contract/host`: geometry warming, the
 * highlight handshake) — the adapter is exactly what that entry exists for.
 * `useSelection()` hands app code the public lens only.
 */

// One-line-per-feature: registration travels with the UI.
export * from '@embedpdf/plugin-selection';
// The clipboard side effect lives in @embedpdf/web (the plugin is DOM-free);
// re-exported here so app code has one import for the whole feature.
export { copySelection } from '@embedpdf/web';
import * as React from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { quadEquals } from '@embedpdf/core-geometry';
import type { CapabilityToken, EventHook } from '@embedpdf/core';
import {
  HANDLE_BAR,
  HANDLE_HEAD,
  HANDLE_PAD,
  SelectionToken,
  createSelectionHandleDrag,
  selectionHandleGeom,
  selectionState,
  type SelectionHandleEndpoint,
  type SelectionHandleView,
  type SelectionAnchor,
  type SelectionCapability,
} from '@embedpdf/plugin-selection';
import { SelectionToken as SelectionHostToken } from '@embedpdf/plugin-selection/contract/host';
import type { StageCapability } from '@embedpdf/plugin-stage/contract';
import {
  attachSelectionHandle,
  mixAccent,
  paint,
  wireSelectionClipboard,
  type SelectionClipboardOptions,
} from '@embedpdf/web';
import { Anchored, useOptionalProjectorBinding, type AnchoredPlacement } from './anchored';
import { devWarn } from './dev';
import { useStageToken } from './stage-scope';
import {
  shallowArray,
  useCapability,
  useCapabilityEvent,
  useKernelValue,
  useOptionalCapability,
  usePage,
  useSelector,
  useViewerSettings,
} from './runtime';
import { settingsHook, stateHook } from './state';

/**
 * The highlight of the selected text on one page, in the selection plugin's
 * `color` setting; the `--epdf-text-selection` CSS variable wins over it.
 */
export function SelectionLayer() {
  const page = usePage();
  const selection = useCapability(SelectionHostToken);
  const segments = useSelector(
    SelectionHostToken,
    (selection) => selection.listSegments(page.ref),
    shallowArray,
  );
  // A consumer (e.g. a markup tool drawing its own preview) can take over the
  // selection visual; when it does, we render nothing so the two never overlap.
  const visible = useSelector(SelectionHostToken, (selection) => selection.isHighlightVisible());
  const color = useSelectionSettings((settings) => settings.color);
  // An unset color follows the viewer's accent, behind the `--epdf-accent` variable.
  const accent = useViewerSettings((settings) => settings.accent);

  // Warm this page's text geometry as soon as it's on screen, so the first
  // pointer-down can hit-test without waiting on the engine round-trip.
  // (A no-op without doc.text.select — nothing warms, nothing renders.)
  useEffect(() => {
    void selection.ensureLoaded(page.ref);
  }, [selection, page.ref]);

  if (!visible) return null;

  // Unset, the color is the accent at 35%, the accent variables included.
  const fill = paint('text-selection', color ?? mixAccent('text-selection', accent));

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
      {segments.map((segment, i) => {
        // page space → un-rotated content view px (rides the page's CSS
        // rotation). An affine map, so mapping the four corners is exact —
        // upright segments render pixel-identical to the old div-per-rect.
        const ring = [
          segment.quad.upperLeft,
          segment.quad.upperRight,
          segment.quad.lowerRight,
          segment.quad.lowerLeft,
        ].map((point) => page.transform.toPixels(point));
        return (
          <polygon
            key={i}
            points={ring.map((point) => `${point.x},${point.y}`).join(' ')}
            // In `style`: an SVG attribute doesn't read var().
            style={{ fill }}
          />
        );
      })}
    </svg>
  );
}

/** The public selection capability (select(), readText(), canCopy(), …) for
 *  app chrome — toolbars, context menus, automation. */
export function useSelection() {
  return useCapability(SelectionToken);
}

/** Subscribe to one selection event for the mounted lifetime: `useSelectionEvent((selection) => selection.onCommitted, handler)`. */
export function useSelectionEvent<T>(
  select: (selection: SelectionCapability) => EventHook<T>,
  handler: (event: T) => void,
): void {
  useCapabilityEvent(SelectionToken, select, handler);
}

/**
 * The selection's state: whether anything is selected, whether the user is
 * still selecting, the character range and the pages it's on (the page's State
 * table, declared once in `selectionState`). Takes a selector, re-renders only
 * when what it returns changes, and returns the empty state without a document.
 */
export const useSelectionState = stateHook(selectionState);

/** The selection settings (`dragThreshold`, `color`, `handles`), with or without a document. Takes a selector. */
export const useSelectionSettings = settingsHook(SelectionToken);

/** Structural equality for the selection's menu anchor — keeps the menu from
 *  re-rendering on unrelated dispatches (the capability returns a fresh
 *  object each call). */
const sameAnchor = (left: SelectionAnchor | null, right: SelectionAnchor | null): boolean => {
  if (left === right) return true;
  if (!left || !right) return false;
  return (
    left.page.objectNumber === right.page.objectNumber &&
    left.bounds.x === right.bounds.x &&
    left.bounds.y === right.bounds.y &&
    left.bounds.width === right.bounds.width &&
    left.bounds.height === right.bounds.height
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
 * Floats over the current text selection (one anchor regardless of
 * cross-page selection; it rides the gesture's end page) — and only once the
 * selection settles: hidden while a gesture is active (mid-drag), it appears at
 * pointer-up; programmatic selections show immediately (born settled). Works
 * under `<Stage>` (mount in the overlay slot) and `<PageView>` alike — the
 * surface provides the projection. Compose the contents from hooks:
 * `useSelection()` for copy/clear, `useAnnotation()` for
 * `markupFromSelection('highlight')`, `copySelection` for the clipboard.
 * For live-follow UI during the drag, compose `<Anchored>` with
 * `getAnchor()` yourself — the primitive carries no policy.
 */
export function SelectionMenu({ children, gap = 8, placement = 'top' }: SelectionMenuProps) {
  const selecting = useSelectionState((state) => state.isSelecting);
  const anchor = useSelector(SelectionToken, (selection) => selection.getAnchor(), sameAnchor);
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
// lives once), and this component keeps what only React can do —
// subscriptions, markup, theming.

interface Endpoints {
  start: SelectionHandleEndpoint;
  end: SelectionHandleEndpoint;
}
const sameEndpoints = (left: Endpoints | null, right: Endpoints | null): boolean => {
  if (left === right) return true;
  if (!left || !right) return false;
  return (
    left.start.page.objectNumber === right.start.page.objectNumber &&
    left.end.page.objectNumber === right.end.page.objectNumber &&
    left.start.advance === right.start.advance &&
    left.end.advance === right.end.advance &&
    // corner-wise, so a boundary that rotates without moving its bounding box
    // still re-renders (an AABB comparison would call that "unchanged")
    quadEquals(left.start.glyphQuad, right.start.glyphQuad) &&
    quadEquals(left.end.glyphQuad, right.end.glyphQuad)
  );
};

/** The plugin's structural view over this Stage: point-exact projection in,
 *  page resolution out. (`pageRectToViewport` is the AABB projector — upright
 *  overlays only — and would collapse exactly the orientation handles need.) */
const handleView = (stage: StageCapability): SelectionHandleView => ({
  toOverlay: (page, pt) => {
    return stage.pageToViewport(page, pt);
  },
  pageAt: (overlay) => stage.getPageAt(overlay),
  pointOnPage: (page, overlay) => stage.viewportToPage(page, overlay),
});

export interface SelectionHandlesProps {
  /** The stage lens hosting this overlay (default: the enclosing `<Stage>`'s lens). */
  token?: CapabilityToken<StageCapability>;
}

/**
 * iOS-style draggable selection handles. Each is drawn the way the platform
 * draws them: a thin caret bar that forms the selection's own start/end edge
 * — the boundary glyph's oriented edge, so rotated text and rotated pages
 * carry the handle with them — capped by a screen-constant circle, above the
 * first line at the start, below the last line at the end.
 *
 * On touch, where a caret drag isn't available, the handles are the way to
 * grow or shrink a selection: a long-press selects a word, then each handle
 * extends from the opposite endpoint, snapping to glyphs and crossing pages
 * exactly like a pointer drag — it rides the same `beginGestureAt`/`extendTo`
 * gesture path, so highlights, menus, and commit signals all behave
 * identically. Mount in the `<Stage>` overlay slot next to `<SelectionMenu>`;
 * outside a Stage it renders nothing (a `PageView` has no camera to project
 * through). Pointer-isolated, so grabbing a handle never pans the stage.
 * Painted in the plugin's `handles` setting, which the
 * `--epdf-text-selection-handle` and `--epdf-text-selection-handle-shadow` CSS
 * variables override.
 */
export function SelectionHandles({ token: explicitToken }: SelectionHandlesProps = {}) {
  const token = useStageToken(explicitToken);
  const host = useCapability(SelectionHostToken);
  const stage = useOptionalCapability(token);
  // Outside a Stage there is no camera to project through: say so instead of
  // rendering nothing silently.
  const surface = useOptionalProjectorBinding();
  if (!surface || surface.projector.space !== 'overlay') {
    devWarn(
      'selection-handles-outside-stage',
      '<SelectionHandles> renders nothing here: mount it in the <Stage> overlay slot ' +
        '(a <PageView> has no camera to project the handles through).',
    );
  }
  const selecting = useSelectionState((state) => state.isSelecting);
  const visible = useSelector(SelectionHostToken, (selection) => selection.isHighlightVisible());
  const handles = useSelectionSettings((settings) => settings.handles);
  const accent = useViewerSettings((settings) => settings.accent);
  const endpoints = useSelector(
    SelectionHostToken,
    (selection): Endpoints | null => {
      const snapshot = selection.getSnapshot();
      if (!snapshot.start || !snapshot.end) return null;
      return {
        start: {
          page: snapshot.start.page,
          glyphQuad: snapshot.start.glyphQuad,
          advance: snapshot.start.advance,
        },
        end: {
          page: snapshot.end.page,
          glyphQuad: snapshot.end.glyphQuad,
          advance: snapshot.end.advance,
        },
      };
    },
    sameEndpoints,
  );
  // The handles are positioned by projecting the endpoint corners through the
  // camera, so they must re-render whenever the camera moves — visiblePages is
  // the stage's reference-stable revision for exactly that (the same value the
  // page surfaces re-render on, so handle and highlight move in one commit).
  useKernelValue(() => stage?.listVisiblePages() ?? null);
  const [dragging, setDragging] = useState<'start' | 'end' | null>(null);
  // The web binder's `arm` must read the current endpoints/stage at pointer
  // down, not the ones captured when the listener attached — a stable ref
  // callback with a live arm-source is the standard escape from that.
  const armSource = useRef<{ stage: StageCapability; endpoints: Endpoints } | null>(null);
  armSource.current = stage && endpoints ? { stage, endpoints } : null;
  const bindHandle = useMemo(() => {
    const detach: Partial<Record<'start' | 'end', () => void>> = {};
    const make = (role: 'start' | 'end') => (element: HTMLDivElement | null) => {
      detach[role]?.();
      delete detach[role];
      if (!element) return;
      detach[role] = attachSelectionHandle(element, {
        arm: () => {
          const src = armSource.current;
          if (!src) return null;
          const view = handleView(src.stage);
          const geometry = selectionHandleGeom(view, src.endpoints[role], role);
          if (!geometry) return null;
          const opposite = src.endpoints[role === 'start' ? 'end' : 'start'];
          const drag = createSelectionHandleDrag(host, view, opposite, src.endpoints[role].page);
          setDragging(role);
          return {
            // the point the user grabbed: the bar's midpoint
            base: {
              x: (geometry.bar.from.x + geometry.bar.to.x) / 2,
              y: (geometry.bar.from.y + geometry.bar.to.y) / 2,
            },
            session: {
              move: drag.move,
              end: () => {
                drag.end(); // settle → menu reappears, onCommitted fires
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
  // handle drag is itself a selection gesture, so it keeps its handles.
  if (selecting && !dragging) return null;
  const view = handleView(stage);
  // Each is its CSS variable first, then the setting; an unset color is the accent.
  const color = paint('text-selection-handle', handles.color ?? accent);
  const shadow = paint('text-selection-handle-shadow', handles.shadow);

  const renderHandle = (role: 'start' | 'end') => {
    const geometry = selectionHandleGeom(view, endpoints[role], role);
    if (!geometry) return null; // endpoint page not laid out right now
    // The shell is laid out upright in its own frame — bar of the edge's
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
          left: geometry.bar.from.x - pivotX,
          top: geometry.bar.from.y - barTop,
          width: HANDLE_BAR + 2 * HANDLE_PAD,
          height: geometry.length + HANDLE_HEAD + 2 * HANDLE_PAD,
          // Upright text carries no transform — pixel-identical to an
          // axis-aligned box (the geometry's float-noise guard decides).
          ...(geometry.upright
            ? null
            : {
                transform: `rotate(${geometry.rotation}deg)`,
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
            height: geometry.length,
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
            top: role === 'start' ? HANDLE_PAD : HANDLE_PAD + geometry.length,
            width: HANDLE_HEAD,
            height: HANDLE_HEAD,
            borderRadius: '50%',
            background: color,
            boxShadow: shadow,
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
 * Mount once per viewer to wire clipboard copy: prefetches the selected text
 * when the selection settles, answers the native `copy` event synchronously,
 * and falls back to the async Clipboard API for ctrl/cmd+C when the page has
 * no DOM selection. Renders nothing, and wires nothing until a document is
 * ready. For a toolbar Copy button, call `copySelection(useSelection())` from
 * its click handler instead.
 */
export function SelectionClipboard({ prefetch }: SelectionClipboardProps = {}) {
  const selection = useOptionalCapability(SelectionToken);
  useEffect(() => {
    if (!selection) return;
    return wireSelectionClipboard(selection, prefetch === undefined ? {} : { prefetch });
  }, [selection, prefetch]);
  return null;
}
