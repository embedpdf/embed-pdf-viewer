/**
 * The search plugin's readers: `useSearch()` (the API), `useSearchState()`,
 * `useSearchSettings()`, `useSearchEvent()`, and `useSearchHits()` for a results list.
 */
import type { EventHook, PageRef } from '@embedpdf/core';
import { SearchToken, searchState } from '@embedpdf/plugin-search';
import type { SearchCapability, SearchHit } from '@embedpdf/plugin-search';
import { useCapability, useCapabilityEvent, useOptionalSelector } from '../runtime/readers.svelte';
import { settingsReader, stateReader } from '../runtime/state.svelte';
import { valueOf, type CurrentValue, type MaybeGetter } from '../runtime/values.svelte';

/**
 * The search API (`search()`, `clear()`, `nextHit()`, `goToHit()`, …) for app chrome. A handle,
 * always the capability of the document in scope.
 */
export function useSearch(): SearchCapability {
  return useCapability(SearchToken);
}

/**
 * The search's state: the query, status, count, active match, progress and error (declared once
 * in `searchState`), as a reactive object (`state.hitCount`). With a selector, the value it picks
 * as `{ current }`. Empty without a document.
 */
export const useSearchState = stateReader(searchState);

/** The search settings (`reveal`, `highlight`), with or without a document. */
export const useSearchSettings = settingsReader(SearchToken);

/**
 * Subscribe to one search event while the component lives:
 * `useSearchEvent((search) => search.onCompleted, handler)`.
 */
export function useSearchEvent<T>(
  select: (search: SearchCapability) => EventHook<T>,
  handler: (event: T) => void,
): void {
  useCapabilityEvent(SearchToken, select, handler);
}

const NO_HITS: readonly SearchHit[] = Object.freeze([]);

/**
 * Every match found so far, or one page's (its ref or its index), as `{ current }`: for a results
 * list or a count per thumbnail. A page that changes is passed as a function
 * (`useSearchHits(() => page.ref)`). The plugin keeps each list's identity until matches land on
 * it, so a list redraws only then. Empty without a document, and for a page that has just left
 * the document.
 */
export function useSearchHits(
  page?: MaybeGetter<PageRef | number | undefined>,
): CurrentValue<readonly SearchHit[]> {
  return useOptionalSelector(
    SearchToken,
    (search) => {
      const only = valueOf(page);
      return search.listHits(only === undefined ? undefined : { page: only });
    },
    NO_HITS,
  );
}
