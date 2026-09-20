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
  /** Highlight colour for hits — SOLID (default: highlighter yellow). */
  color?: string;
  /** Highlight colour for the ACTIVE hit — SOLID (default: orange). */
  activeColor?: string;
  /**
   * How the highlight composites with the page. `'multiply'` (default) is
   * the real-highlighter look: text stays crisp black through the colour,
   * only the paper tints. Pass `'normal'` (with translucent colours) for
   * dark/scanned documents where multiply-on-dark would vanish.
   */
  blendMode?: React.CSSProperties['mixBlendMode'];
}

export function SearchLayer({
  color = '#ffd500',
  activeColor = '#ff9632',
  blendMode = 'multiply',
}: SearchLayerProps) {
  const page = usePage();
  // Per-page hit arrays are reference-stable in the plugin, so plain Object.is works.
  const hits = useSelector(SearchToken, (c) => c.listHits({ page: page.ref }));
  const active = useSelector(SearchToken, (c) => c.getActiveHit());

  if (hits.length === 0) return null;

  return (
    <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
      {hits.map((hit: SearchHit) =>
        hit.segments.map(({ quad: q }, i) => {
          const fill = hit === active ? activeColor : color;
          // Upright hits keep the classic rounded div (pixel-identical to the
          // pre-orientation layer); rotated hits draw their true oriented cell.
          const upright =
            q.upperStart.y === q.upperEnd.y &&
            q.lowerStart.y === q.lowerEnd.y &&
            q.upperStart.x === q.lowerStart.x;
          if (upright) {
            const tl = page.transform.toPixels(q.upperStart);
            const br = page.transform.toPixels(q.lowerEnd);
            return (
              <div
                key={`${hit.charStart}:${i}`}
                style={{
                  position: 'absolute',
                  left: tl.x,
                  top: tl.y,
                  width: br.x - tl.x,
                  height: br.y - tl.y,
                  background: fill,
                  mixBlendMode: blendMode,
                  borderRadius: 2,
                }}
              />
            );
          }
          const ring = [q.upperStart, q.upperEnd, q.lowerEnd, q.lowerStart].map((p) =>
            page.transform.toPixels(p),
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
              <polygon points={ring.map((p) => `${p.x},${p.y}`).join(' ')} fill={fill} />
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

/** Subscribe to one search event for the mounted lifetime: `useSearchEvent((c) => c.onCompleted, handler)`. */
export function useSearchEvent<T>(
  select: (cap: SearchCapability) => EventHook<T>,
  handler: (event: T) => void,
): void {
  useCapabilityEvent(SearchToken, select, handler);
}

/** Reactive search read-model for chrome: the query, status, counts, progress. */
export function useSearchState() {
  const query = useSelector(SearchToken, (c) => c.getQuery());
  const status = useSelector(SearchToken, (c) => c.getStatus());
  const hitCount = useSelector(SearchToken, (c) => c.getHitCount());
  const activeIndex = useSelector(SearchToken, (c) => c.getActiveHitIndex());
  const progress = useSelector(SearchToken, (c) => c.getProgress());
  const error = useSelector(SearchToken, (c) => c.getError());
  return { query, status, hitCount, activeIndex, progress, error };
}
