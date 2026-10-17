import { definePlugin } from '@embedpdf/core';
import { StageToken } from '@embedpdf/plugin-stage/contract';

import { SEARCH_DEFAULTS, SearchToken, type SearchConfig } from './contract';
import { createSearchController } from './controller';
import { initialSearchState } from './model';

/**
 * Document text search over the engine's budgeted, resumable slices.
 * Document-scoped; no pointer handling. The stage is optional: with one,
 * scans start at the current page and navigation reveals hits. `config` is
 * the settings the app registers, over {@link SEARCH_DEFAULTS}.
 */
export const searchPlugin = (config?: SearchConfig) =>
  definePlugin({
    id: 'search',
    token: SearchToken,
    scope: 'document',
    optional: [StageToken],
    state: initialSearchState,
    settings: { defaults: SEARCH_DEFAULTS, registered: config },
    create: createSearchController,
  });
