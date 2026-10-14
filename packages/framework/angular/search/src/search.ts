/**
 * The search plugin's service and feature:
 *
 *   withSearch(options)     the plugin, for provideEmbedPdf()
 *   inject(EpdfSearch)      search and step through the matches, the State table as signals
 *                           (`hitCount()`, `activeHitIndex()`, `status()`, …), the matches
 *                           (`hits()`, `hitsOn(page)`), the events as streams (`completed$`, …),
 *                           and the settings
 */
import { Injectable, type Signal } from '@angular/core';
import type { PageRef } from '@embedpdf/core';
import { pluginService, type EmbedPdfFeature } from '@embedpdf/angular/runtime';
import {
  searchPlugin,
  searchState,
  SearchToken,
  type SearchConfig,
  type SearchHit,
} from '@embedpdf/plugin-search';

const NO_HITS: readonly SearchHit[] = Object.freeze([]);

/**
 * Search: `search({ text })`, `nextHit()`, `goToHit(hit)` and the rest of the Search page's
 * methods, every value of its State table as a signal (`search.hitCount()`), its events as
 * streams (`search.completed$`), and its settings (`search.updateSettings({ highlight })`).
 * Without a document the signals read empty and the methods refuse with `not-ready`.
 */
@Injectable({ providedIn: 'root' })
export class EpdfSearch extends pluginService({
  name: 'EpdfSearch',
  feature: 'withSearch()',
  token: SearchToken,
  state: searchState,
  methods: [
    'search',
    'nextHit',
    'previousHit',
    'goToHit',
    'revealActiveHit',
    'listHits',
    'listPagesWithHits',
    'cancel',
    'clear',
    'refresh',
    'findAll',
    'canSearch',
    'getQuery',
    'getStatus',
    'getHitCount',
    'getActiveHitIndex',
    'getActiveHit',
    'getProgress',
    'getError',
  ],
  events: [
    'onStarted',
    'onProgressChanged',
    'onCompleted',
    'onCancelled',
    'onFailed',
    'onActiveHitChanged',
    'onCleared',
  ],
}) {
  /**
   * Every match found so far, for a list of results. The plugin hands out the same array until
   * matches are added, so a list redraws only when there are new ones. Empty without a document.
   */
  readonly hits: Signal<readonly SearchHit[]> = this.binding.select(
    (search) => search.listHits(),
    NO_HITS,
    Object.is,
  );

  /**
   * The matches on one page (its ref or its index), for a count on a thumbnail. Pass a function
   * (`() => this.page().ref`) and it follows the page you show. Empty for a page that isn't in
   * the document, and without one.
   */
  hitsOn(page: PageRef | number | (() => PageRef | number)): Signal<readonly SearchHit[]> {
    const pageOf = typeof page === 'function' ? page : () => page;
    return this.binding.select((search) => search.listHits({ page: pageOf() }), NO_HITS, Object.is);
  }
}

/** The search plugin, with its settings: `withSearch({ highlight: { color: '#fde047' } })`. */
export function withSearch(options?: SearchConfig): EmbedPdfFeature {
  return { plugins: [searchPlugin(options)], services: [EpdfSearch] };
}
