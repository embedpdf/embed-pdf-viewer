/** Search capability/query protocol without scan/effect/plugin wiring. */
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
export { validateSearchQuery, validateSearchRegex } from '@embedpdf/engine-core/runtime';
export type {
  SearchQuery,
  SearchQueryIssue,
  SearchQueryValidation,
  SearchRegexValidation,
  SearchSnippet,
} from '@embedpdf/engine-core/runtime';
