export { searchPlugin } from './search.plugin';
export { SearchToken } from './types';
export type {
  SearchCapability,
  SearchExecOptions,
  SearchFindAllOptions,
  SearchHit,
  SearchPluginConfig,
  SearchRevealOptions,
  SearchState,
  SearchStatus,
} from './types';
// THE query shape (engine → wire → state → search box) and its validator —
// call validateSearchQuery on keystroke for early feedback (regex dialect +
// flag combos, e.g. regex+matchDiacritics); engines enforce the same rules.
export { validateSearchQuery, validateSearchRegex } from '@embedpdf/engine-core/runtime';
export type {
  SearchQuery,
  SearchQueryIssue,
  SearchQueryValidation,
  SearchRegexValidation,
  SearchSnippet,
} from '@embedpdf/engine-core/runtime';
