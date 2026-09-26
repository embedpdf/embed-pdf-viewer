import { definePlugin } from '@embedpdf/core';

import type { I18nConfig } from './contract';
import { createI18nController } from './controller';
import { I18nToken } from './host-contract';
import type { I18nHostCapability } from './host-contract';
import { i18nReducer, initialI18nState } from './model';
import type { I18nAction, I18nState } from './model';

/**
 * The i18n plugin: workspace-scoped (locale is a workspace concern) with NO
 * dependencies — engine-free, DOM-free. Its capability is built synchronously
 * in `createKernel()`, so the shell translates from the first frame, while
 * the engine is still booting.
 */
export const i18nPlugin = (config: I18nConfig = {}) =>
  definePlugin<I18nState, I18nAction, I18nHostCapability>({
    id: 'i18n',
    scope: 'workspace',
    token: I18nToken,
    initialState: () => initialI18nState(config),
    reduce: i18nReducer,
    create: (ctx) => createI18nController(ctx, config),
  });
