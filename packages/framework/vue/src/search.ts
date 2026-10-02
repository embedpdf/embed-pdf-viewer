/**
 * @embedpdf/vue/search: the Vue surface of `@embedpdf/plugin-search`.
 *
 * `<SearchLayer>` paints the matches on a page; search is driven from your own
 * chrome with `useSearch()`, shown with `useSearchState()` and
 * `useSearchHits()`, and followed with `useSearchEvent()`.
 */

// One line per feature: registration travels with the UI.
export * from '@embedpdf/plugin-search';
export { default as SearchLayer } from './search/SearchLayer.vue';
export {
  useSearch,
  useSearchEvent,
  useSearchHits,
  useSearchSettings,
  useSearchState,
} from './search/composables';
