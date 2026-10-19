/**
 * @embedpdf/svelte/search — full-text search.
 *
 * `<SearchLayer>` paints the matches on each page (and makes them clickable with `onHitClick`);
 * the readers are the plugin's four, `useSearch()`, `useSearchState()`, `useSearchSettings()` and
 * `useSearchEvent()`, and `useSearchHits()` for a results list.
 */

// Registration travels with the UI.
export * from '@embedpdf/plugin-search';

export { default as SearchLayer } from './search/SearchLayer.svelte';
export type { SearchLayerProps } from './search/props';
export {
  useSearch,
  useSearchEvent,
  useSearchHits,
  useSearchSettings,
  useSearchState,
} from './search/readers.svelte';
