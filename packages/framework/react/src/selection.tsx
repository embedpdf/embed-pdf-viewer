/**
 * The React surface for @embedpdf/plugin-selection.
 *
 * <SelectionLayer> is a dumb renderer: it warms the page's geometry on mount,
 * reads the content-space highlight rects from the capability, and paints them —
 * mapping each rect through PageContext.pageToContent (the same path markers use).
 * Zero pointer handling here; that's the PagePointerSource + the hub.
 */

// One-line-per-feature: registration travels with the UI.
export * from '@embedpdf/plugin-selection';
import * as React from 'react';
import { useEffect } from 'react';
import { SelectionToken } from '@embedpdf/plugin-selection';
import { shallowArray, useCapability, usePage, useSelector } from './runtime';

export interface SelectionLayerProps {
  /** Highlight colour (default: translucent blue). */
  color?: string;
}

export function SelectionLayer({ color = 'rgba(33, 150, 243, 0.35)' }: SelectionLayerProps) {
  const page = usePage();
  const selection = useCapability(SelectionToken);
  const segments = useSelector(SelectionToken, (c) => c.segmentsForPage(page.pon), shallowArray);
  // A consumer (e.g. a markup tool drawing its own preview) can take over the
  // selection visual; when it does, we render nothing so the two never overlap.
  const visible = useSelector(SelectionToken, (c) => c.highlightVisible());

  // Warm this page's text geometry as soon as it's on screen, so the first
  // pointer-down can hit-test without waiting on the engine round-trip.
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

/** The selection capability (clear(), hasSelection(), …) for app chrome. */
export function useSelection() {
  return useCapability(SelectionToken);
}
