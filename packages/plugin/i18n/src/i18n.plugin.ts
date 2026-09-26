import { definePlugin } from '@embedpdf/core';

import { I18nToken, type I18nCapability, type I18nConfig } from './contract';
import { createI18nController } from './controller';
import { initialI18nState, type I18nState } from './model';

/**
 * The i18n plugin: workspace-scoped (locale is a workspace concern) with no
 * dependencies — engine-free, DOM-free. Its capability is built synchronously
 * in `createKernel()`, so the shell translates from the first frame, while
 * the engine is still booting.
 */
export const i18nPlugin = (config: I18nConfig = {}) =>
  definePlugin<I18nState, I18nCapability>({
    id: 'i18n',
    scope: 'workspace',
    token: I18nToken,
    state: () => initialI18nState(config),
    create: (ctx) => createI18nController(ctx, config),
  });
