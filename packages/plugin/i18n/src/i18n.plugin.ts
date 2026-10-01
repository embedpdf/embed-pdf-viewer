import { definePlugin } from '@embedpdf/core';

import { I18N_DEFAULTS, I18nToken, type I18nConfig } from './contract';
import { createI18nController } from './controller';
import { initialI18nState } from './model';

/**
 * Translations and the current language. Workspace-scoped, with no dependencies and no engine
 * calls: the capability exists from `createKernel()`, so the viewer translates while the engine
 * is still loading. `config` is the settings the app registers, over {@link I18N_DEFAULTS}.
 */
export const i18nPlugin = (config?: I18nConfig) =>
  definePlugin({
    id: 'i18n',
    scope: 'workspace',
    token: I18nToken,
    state: initialI18nState,
    settings: { defaults: I18N_DEFAULTS, registered: config },
    create: createI18nController,
  });
