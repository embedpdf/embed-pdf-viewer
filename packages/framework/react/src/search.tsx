/**
 * The React surface for @embedpdf/plugin-search.
 *
 * <SearchLayer> is a dumb renderer, the SelectionLayer's twin: it reads
 * the page's content-space hit rects from the capability and paints them
 * through PageContext.pageToContent. The active hit gets its own colour.
 * No pointer handling, no engine calls — search is driven from app chrome
 * via useSearch().
 */

// One-line-per-feature: registration travels with the UI.
export * from '@embedpdf/plugin-search';
import * as React from 'react';
import { SearchToken } from '@embedpdf/plugin-search';
import type { SearchHit } from '@embedpdf/plugin-search';
import { shallowArray, useCapability, usePage, useSelector } from './runtime';

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
  const hits = useSelector(SearchToken, (c) => c.hitsForPage(page.pon), shallowArray);
  const active = useSelector(SearchToken, (c) => c.activeHit());

  if (hits.length === 0) return null;

  return (
    <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
      {hits.map((hit: SearchHit) =>
        hit.rects.map((r, i) => {
          const tl = page.transform.pageToContent({ x: r.x, y: r.y });
          const br = page.transform.pageToContent({ x: r.x + r.width, y: r.y + r.height });
          return (
            <div
              key={`${hit.charStart}:${i}`}
              style={{
                position: 'absolute',
                left: tl.x,
                top: tl.y,
                width: br.x - tl.x,
                height: br.y - tl.y,
                background: hit === active ? activeColor : color,
                mixBlendMode: blendMode,
                borderRadius: 2,
              }}
            />
          );
        }),
      )}
    </div>
  );
}

/** The search capability (search/clear/next/prev/…) for app chrome. */
export function useSearch() {
  return useCapability(SearchToken);
}

/** Reactive search read-model for chrome: the query, status, counts, progress. */
export function useSearchState() {
  const query = useSelector(SearchToken, (c) => c.query());
  const status = useSelector(SearchToken, (c) => c.status());
  const hitCount = useSelector(SearchToken, (c) => c.hitCount());
  const activeIndex = useSelector(SearchToken, (c) => c.activeIndex());
  const progress = useSelector(
    SearchToken,
    (c) => c.progress(),
    (a, b) => a.scanned === b.scanned && a.total === b.total,
  );
  const error = useSelector(SearchToken, (c) => c.errorMessage());
  return { query, status, hitCount, activeIndex, progress, error };
}
