import { definePlugin } from '@embedpdf/core';
import { createI18nCapability } from './capability';
import { registerI18nEffects } from './effects';
import { i18nReducer, initialI18nState } from './reducer';
import { I18nToken } from './types';
import type { I18nAction, I18nCapability, I18nConfig, I18nState } from './types';

/**
 * The i18n plugin: workspace-scoped (locale is a workspace concern) with NO
 * dependencies — engine-free, DOM-free. Its capability is built synchronously
 * in `createKernel()`, so the shell translates from the first frame, while
 * the engine is still booting.
 */
export const i18nPlugin = (config: I18nConfig = {}) =>
  definePlugin<I18nState, I18nAction, I18nCapability>({
    id: 'i18n',
    scope: 'workspace',
    token: I18nToken,
    initialState: () => initialI18nState(config),
    reduce: i18nReducer,
    capability: (ctx) => createI18nCapability(ctx, config),
    effects: registerI18nEffects(config),
  });
