/**
 * The search composables: `useSearch()` (the API), `useSearchState()`,
 * `useSearchSettings()`, `useSearchEvent()`, and `useSearchHits()` for a
 * results list or a count per page.
 */
import { toValue } from 'vue';
import type { MaybeRefOrGetter, Ref } from 'vue';
import { SearchToken, searchState } from '@embedpdf/plugin-search';
import type { SearchCapability, SearchHit } from '@embedpdf/plugin-search';
import type { EventHook, PageRef } from '@embedpdf/core';
import { useCapability, useCapabilityEvent, useOptionalSelector } from '../runtime/capabilities';
import { settingsComposable, stateComposable } from '../state';

/** The search API (`search`, `clear`, `nextHit`, `goToHit`, …) for your chrome. The object never changes. */
export function useSearch(): SearchCapability {
  return useCapability(SearchToken);
}

/** Subscribe to one search event while the component lives: `useSearchEvent((search) => search.onCompleted, handler)`. */
export function useSearchEvent<Event>(
  select: (search: SearchCapability) => EventHook<Event>,
  handler: (event: Event) => void,
): void {
  useCapabilityEvent(SearchToken, select, handler);
}

/**
 * The search's state as refs: the query, status, count, active match, progress
 * and error (the page's State table, declared once in `searchState`). With a
 * selector, one ref that updates only when the value it picks changes.
 */
export const useSearchState = stateComposable(searchState);

/** The search settings (`reveal`, `highlight`), with or without a document, as refs. Takes a selector. */
export const useSearchSettings = settingsComposable(SearchToken);

const NO_HITS: readonly SearchHit[] = Object.freeze([]);

/**
 * Every match found so far, or one page's (its ref or index; a getter to
 * follow a prop), as a ref: for a results list or a count per thumbnail. The
 * plugin hands out the same array until matches land on what it covers, so
 * the ref updates only then. Empty without a document, and for a page that
 * isn't in the document.
 */
export function useSearchHits(
  page?: MaybeRefOrGetter<PageRef | number | undefined>,
): Readonly<Ref<readonly SearchHit[]>> {
  return useOptionalSelector(
    SearchToken,
    (search) => {
      const wanted = toValue(page);
      return search.listHits(wanted === undefined ? undefined : { page: wanted });
    },
    NO_HITS,
  );
}
