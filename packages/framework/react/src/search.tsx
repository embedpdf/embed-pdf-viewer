/**
 * The React surface for @embedpdf/plugin-search.
 *
 * <SearchLayer> is the SelectionLayer's twin: it reads the page's page-space
 * hit rects from the capability and paints them through PageContext.toPixels,
 * in the colors of the plugin's `highlight` setting, which the `--epdf-search-*`
 * CSS variables override. No engine calls: search is driven from app chrome
 * via useSearch().
 */

// One-line-per-feature: registration travels with the UI.
export * from '@embedpdf/plugin-search';
import * as React from 'react';
import { useRef } from 'react';
import { SearchToken, searchState } from '@embedpdf/plugin-search';
import type { SearchCapability, SearchHit } from '@embedpdf/plugin-search';
import type { EventHook, PageRef } from '@embedpdf/core';
import { paint } from '@embedpdf/web';
import {
  useCapability,
  useCapabilityEvent,
  useDocumentScope,
  useKernelValue,
  usePage,
} from './runtime';
import { settingsHook, stateHook } from './state';

/**
 * How far (CSS px) a press on a match may travel and still count as a click.
 * A mouse or pen press that travels 4 px starts selecting text (the selection
 * plugin's default drag threshold), so from there on it is a drag. A finger
 * wobbles more on its own, and the Stage treats a touch that stays within
 * 10 px as a tap.
 */
const CLICK_SLOP_PX: Readonly<Record<string, number>> = { mouse: 4, pen: 4, touch: 10 };

export interface SearchLayerProps {
  /**
   * Make matches clickable: called with the match someone clicks, for example
   * to make it the active one. The press still reaches the page, so a drag
   * that starts on a match selects text, and only a click calls this.
   * Without it, matches are only paint and the pointer goes straight through.
   */
  onHitClick?: (hit: SearchHit) => void;
}

export function SearchLayer({ onHitClick }: SearchLayerProps) {
  const page = usePage();
  // Per-page hit arrays are reference-stable in the plugin, so this re-renders
  // only when matches land on this page.
  const hits = useSearchHits(page.ref);
  const active = useSearchState((state) => state.activeHit);
  const highlight = useSearchSettings((settings) => settings.highlight);
  // Where the pointer went down on a match, to tell a click from a drag.
  const press = useRef<{ x: number; y: number; slop: number } | null>(null);

  if (hits.length === 0) return null;

  // Each color is its CSS variable first, then the setting: CSS wins.
  const color = paint('search-highlight', highlight.color);
  const activeColor = paint('search-highlight-active', highlight.activeColor);
  const blendMode = paint(
    'search-blend-mode',
    highlight.blendMode,
  ) as React.CSSProperties['mixBlendMode'];

  // Only a clickable match takes the pointer; a plain highlight stays inert.
  // Nothing here stops the press, so it reaches the page as well.
  const clickable = onHitClick ? { pointerEvents: 'auto' as const, cursor: 'pointer' } : null;
  const pointerHandlers = (hit: SearchHit) =>
    onHitClick && {
      onPointerDown: (event: React.PointerEvent) => {
        press.current = {
          x: event.clientX,
          y: event.clientY,
          slop: CLICK_SLOP_PX[event.pointerType] ?? CLICK_SLOP_PX.mouse,
        };
      },
      onClick: (event: React.MouseEvent) => {
        const start = press.current;
        press.current = null;
        // A press that travelled that far selected text: it was a drag, not a click.
        if (start && Math.hypot(event.clientX - start.x, event.clientY - start.y) >= start.slop) {
          return;
        }
        onHitClick(hit);
      },
    };

  return (
    <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
      {hits.map((hit: SearchHit) =>
        hit.segments.map(({ quad }, i) => {
          const fill = hit === active ? activeColor : color;
          // Upright hits keep the classic rounded div (pixel-identical to the
          // pre-orientation layer); rotated hits draw their true oriented cell.
          const upright =
            quad.upperLeft.y === quad.upperRight.y &&
            quad.lowerLeft.y === quad.lowerRight.y &&
            quad.upperLeft.x === quad.lowerLeft.x;
          if (upright) {
            const tl = page.transform.toPixels(quad.upperLeft);
            const br = page.transform.toPixels(quad.lowerRight);
            return (
              <div
                key={`${hit.start}:${i}`}
                {...pointerHandlers(hit)}
                style={{
                  position: 'absolute',
                  left: tl.x,
                  top: tl.y,
                  width: br.x - tl.x,
                  height: br.y - tl.y,
                  backgroundColor: fill,
                  mixBlendMode: blendMode,
                  borderRadius: 2,
                  ...clickable,
                }}
              />
            );
          }
          const ring = [quad.upperLeft, quad.upperRight, quad.lowerRight, quad.lowerLeft].map(
            (point) => page.transform.toPixels(point),
          );
          return (
            <svg
              key={`${hit.start}:${i}`}
              style={{
                position: 'absolute',
                inset: 0,
                width: '100%',
                height: '100%',
                overflow: 'visible',
                mixBlendMode: blendMode,
              }}
            >
              {/* The fill goes in `style`: an SVG attribute doesn't read var(). */}
              <polygon
                points={ring.map((point) => `${point.x},${point.y}`).join(' ')}
                {...pointerHandlers(hit)}
                style={{ fill, ...clickable }}
              />
            </svg>
          );
        }),
      )}
    </div>
  );
}

/** The search capability (search / clear / nextHit / previousHit / …) for app chrome. */
export function useSearch(): SearchCapability {
  return useCapability(SearchToken);
}

/** Subscribe to one search event for the mounted lifetime: `useSearchEvent((search) => search.onCompleted, handler)`. */
export function useSearchEvent<T>(
  select: (search: SearchCapability) => EventHook<T>,
  handler: (event: T) => void,
): void {
  useCapabilityEvent(SearchToken, select, handler);
}

/**
 * The search's state: the query, status, count, active match, progress and
 * error (the page's State table, declared once in `searchState`). Takes a
 * selector, and re-renders only when what it returns changes.
 */
export const useSearchState = stateHook(searchState);

/** The search settings (`reveal`, `highlight`), with or without a document. Takes a selector. */
export const useSearchSettings = settingsHook(SearchToken);

const NO_HITS: readonly SearchHit[] = Object.freeze([]);

/**
 * Every match found so far, or one page's (its ref or index), for a results
 * list or a count per thumbnail. The arrays are reference-stable, so a
 * component re-renders only when matches land on what it shows. Empty without
 * a document, and for a page that has just left the document.
 */
export function useSearchHits(page?: PageRef | number): readonly SearchHit[] {
  const scoped = useDocumentScope();
  // Resolved on every read, like the state hook: a document that closes reads as no hits.
  return useKernelValue(
    (kernel) =>
      kernel
        .tryCapability(SearchToken, scoped ?? undefined)
        ?.listHits(page === undefined ? undefined : { page }) ?? NO_HITS,
  );
}
