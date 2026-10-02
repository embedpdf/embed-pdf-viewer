/**
 * A test context for the actions controller: the plugin's settings as
 * `actionsPlugin(config)` registers them, so a test passes the same `config`
 * here and to `createActionsController`.
 */
import { createTestContext, type TestContextOptions } from '@embedpdf/core/testing';

import { ACTIONS_DEFAULTS, type ActionsConfig, type ActionsSettings } from '../../src/contract';
import { registeredSettings } from '../../src/settings';

export function createActionsTestContext(
  options: Omit<TestContextOptions<void, ActionsSettings>, 'settings'>,
  config?: ActionsConfig,
) {
  return createTestContext<void, ActionsSettings>({
    ...options,
    settings: { defaults: ACTIONS_DEFAULTS, registered: registeredSettings(config) },
  });
}
