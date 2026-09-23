/**
 * The React surface for @embedpdf/plugin-search.
 *
 * <SearchLayer> is a dumb renderer, the SelectionLayer's twin: it reads
 * the page's content-space hit rects from the capability and paints them
 * through PageContext.toPixels. The active hit gets its own colour.
 * No pointer handling, no engine calls — search is driven from app chrome
 * via useSearch().
 */

// One-line-per-feature: registration travels with the UI.
export * from '@embedpdf/plugin-search';
import * as React from 'react';
import { SearchToken } from '@embedpdf/plugin-search';
import type { SearchCapability, SearchHit } from '@embedpdf/plugin-search';
import type { EventHook } from '@embedpdf/core';
import { useCapability, useCapabilityEvent, usePage, useSelector } from './runtime';

export interface SearchLayerProps {
  /** Highlight colour for hits — solid (default: highlighter yellow). */
  color?: string;
  /** Highlight colour for the active hit — solid (default: orange). */
  activeColor?: string;
  /**
   * How the highlight composites with the page. `'multiply'` (default) is
   * the real-highlighter look: text stays crisp black through the colour,
   * only the paper tints. Pass `'normal'` (with translucent colours) for
   * dark/scanned documents where multiply-on-dark would vanish.
   */
  blendMode?: React.CSSProperties['mixBlendMode'];
  /** Make hits clickable: called with the hit under the pointer (e.g. to activate it). */
  onHitClick?: (hit: SearchHit) => void;
}

export function SearchLayer({
  color = '#ffd500',
  activeColor = '#ff9632',
  blendMode = 'multiply',
  onHitClick,
}: SearchLayerProps) {
  const page = usePage();
  // Per-page hit arrays are reference-stable in the plugin, so plain Object.is works.
  const hits = useSelector(SearchToken, (search) => search.listHits({ page: page.ref }));
  const active = useSelector(SearchToken, (search) => search.getActiveHit());

  if (hits.length === 0) return null;

  return (
    <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
      {hits.map((hit: SearchHit) =>
        hit.segments.map(({ quad }, i) => {
          const fill = hit === active ? activeColor : color;
          // Only a clickable hit takes the pointer; a plain highlight stays inert.
          const clickable = onHitClick
            ? { pointerEvents: 'auto' as const, cursor: 'pointer' }
            : null;
          const onClick = onHitClick ? () => onHitClick(hit) : undefined;
          // Upright hits keep the classic rounded div (pixel-identical to the
          // pre-orientation layer); rotated hits draw their true oriented cell.
          const upright =
            quad.upperStart.y === quad.upperEnd.y &&
            quad.lowerStart.y === quad.lowerEnd.y &&
            quad.upperStart.x === quad.lowerStart.x;
          if (upright) {
            const tl = page.transform.toPixels(quad.upperStart);
            const br = page.transform.toPixels(quad.lowerEnd);
            return (
              <div
                key={`${hit.charStart}:${i}`}
                onClick={onClick}
                style={{
                  position: 'absolute',
                  left: tl.x,
                  top: tl.y,
                  width: br.x - tl.x,
                  height: br.y - tl.y,
                  background: fill,
                  mixBlendMode: blendMode,
                  borderRadius: 2,
                  ...clickable,
                }}
              />
            );
          }
          const ring = [quad.upperStart, quad.upperEnd, quad.lowerEnd, quad.lowerStart].map(
            (point) => page.transform.toPixels(point),
          );
          return (
            <svg
              key={`${hit.charStart}:${i}`}
              style={{
                position: 'absolute',
                inset: 0,
                width: '100%',
                height: '100%',
                overflow: 'visible',
                mixBlendMode: blendMode,
              }}
            >
              <polygon
                points={ring.map((point) => `${point.x},${point.y}`).join(' ')}
                fill={fill}
                onClick={onClick}
                style={clickable ?? undefined}
              />
            </svg>
          );
        }),
      )}
    </div>
  );
}

/** The search capability (search / clear / nextHit / previousHit / …) for app chrome. */
export function useSearch() {
  return useCapability(SearchToken);
}

/** Subscribe to one search event for the mounted lifetime: `useSearchEvent((search) => search.onCompleted, handler)`. */
export function useSearchEvent<T>(
  select: (search: SearchCapability) => EventHook<T>,
  handler: (event: T) => void,
): void {
  useCapabilityEvent(SearchToken, select, handler);
}

/** Reactive search read-model for chrome: the query, status, counts, progress. */
export function useSearchState() {
  const query = useSelector(SearchToken, (search) => search.getQuery());
  const status = useSelector(SearchToken, (search) => search.getStatus());
  const hitCount = useSelector(SearchToken, (search) => search.getHitCount());
  const activeIndex = useSelector(SearchToken, (search) => search.getActiveHitIndex());
  const progress = useSelector(SearchToken, (search) => search.getProgress());
  const error = useSelector(SearchToken, (search) => search.getError());
  return { query, status, hitCount, activeIndex, progress, error };
}
