import { definePlugin } from '@embedpdf/core';
import { StageToken } from '@embedpdf/plugin-stage/contract';

import { createSearchCapability } from './capability';
import { registerSearchEffects } from './effects';
import { initialSearchState, searchReducer } from './reducer';
import { SearchToken } from './types';
import type { SearchAction, SearchCapability, SearchPluginConfig, SearchState } from './types';

/**
 * Document text search over `doc.search` — the engine's budgeted,
 * cursor-resumable slices. Document-scoped; no pointer handling, so it
 * needs no interaction hub. The Stage is optional: when present, scans
 * start at the current page (viewport-first) and hit navigation reveals
 * the hit's page; without it the host owns scrolling.
 */
export const searchPlugin = (config?: SearchPluginConfig) =>
  definePlugin<SearchState, SearchAction, SearchCapability>({
    id: 'search',
    token: SearchToken,
    scope: 'document',
    optional: [StageToken],
    initialState: initialSearchState,
    reduce: searchReducer,
    capability: (ctx) => createSearchCapability(ctx, config),
    effects: registerSearchEffects,
  });
