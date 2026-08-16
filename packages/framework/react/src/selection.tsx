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
import { useEffect } from 'react';
import { SelectionToken, type SelectionMenuAnchor } from '@embedpdf/plugin-selection';
import { SelectionToken as SelectionHostToken } from '@embedpdf/plugin-selection/internal';
import { wireSelectionClipboard, type SelectionClipboardOptions } from '@embedpdf/web';
import { Anchored, type AnchoredPlacement } from './anchored';
import { shallowArray, useCapability, usePage, useSelector } from './runtime';

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
