import { definePlugin } from '@embedpdf/core';
import { StageToken } from '@embedpdf/plugin-stage/contract';

import { SearchToken, type SearchCapability, type SearchConfig } from './contract';
import { createSearchController } from './controller';
import { initialSearchState, type SearchState } from './model';

/**
 * Document text search over the engine's budgeted, resumable slices.
 * Document-scoped; no pointer handling. The stage is optional: with one,
 * scans start at the current page and navigation reveals hits.
 */
export const searchPlugin = (config?: SearchConfig) =>
  definePlugin<SearchState, SearchCapability>({
    id: 'search',
    token: SearchToken,
    scope: 'document',
    optional: [StageToken],
    state: initialSearchState,
    create: (ctx) => createSearchController(ctx, config),
  });
