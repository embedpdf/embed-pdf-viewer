import { definePlugin } from '@embedpdf/core';
import { StageToken } from '@embedpdf/plugin-stage/contract';
import { SearchToken, type SearchCapability, type SearchConfig } from './contract';
import { createSearchController } from './controller';
import { initialSearchState, reduceSearch, type SearchAction, type SearchState } from './model';

/**
 * Document text search over the engine's budgeted, cursor-resumable slices.
 * Document-scoped; no pointer handling. The Stage is optional: with one, scans
 * start at the current page (viewport-first) and navigation reveals hits.
 */
export const searchPlugin = (config?: SearchConfig) =>
  definePlugin<SearchState, SearchAction, SearchCapability>({
    id: 'search',
    token: SearchToken,
    scope: 'document',
    optional: [StageToken],
    initialState: initialSearchState,
    reduce: reduceSearch,
    create: (ctx) => createSearchController(ctx, config),
  });
