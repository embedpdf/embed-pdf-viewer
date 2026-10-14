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
import { useState } from 'react';
import { SearchToken, searchState } from '@embedpdf/plugin-search';
import type { SearchCapability, SearchHit } from '@embedpdf/plugin-search';
import type { EventHook, PageRef } from '@embedpdf/core';
import { createClickDetector, paint, searchHighlightsOf } from '@embedpdf/web';
import {
  useCapability,
  useCapabilityEvent,
  useDocumentScope,
  useKernelValue,
  usePage,
} from './runtime';
import { settingsHook, stateHook } from './state';

export interface SearchLayerProps {
  /**
   * Make matches clickable: called with the match someone clicks, for example
   * to make it the active one with `search.goToHit(hit)`. The press still
   * reaches the page, so a drag that starts on a match selects text, and only
   * a click calls this. Without it, matches are only paint and the pointer
   * goes straight through.
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
  // Tells a click on a match from a drag that starts there (and selects text).
  const [clicks] = useState(createClickDetector);

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
      onPointerDown: (event: React.PointerEvent) => clicks.press(event),
      onClick: (event: React.MouseEvent) => {
        if (clicks.isClick(event)) onHitClick(hit);
      },
    };

  // Upright lines are a rounded box; turned lines draw their true quad.
  const pieces = searchHighlightsOf(hits, {
    active,
    page: page.transform,
    color,
    activeColor,
  });

  return (
    <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
      {pieces.map((piece) =>
        piece.box ? (
          <div
            key={piece.key}
            {...pointerHandlers(piece.hit)}
            style={{
              position: 'absolute',
              left: piece.box.left,
              top: piece.box.top,
              width: piece.box.width,
              height: piece.box.height,
              backgroundColor: piece.fill,
              mixBlendMode: blendMode,
              borderRadius: 2,
              ...clickable,
            }}
          />
        ) : (
          <svg
            key={piece.key}
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
              points={piece.points ?? undefined}
              {...pointerHandlers(piece.hit)}
              style={{ fill: piece.fill, ...clickable }}
            />
          </svg>
        ),
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
