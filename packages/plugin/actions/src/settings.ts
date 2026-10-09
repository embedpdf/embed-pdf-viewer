/** The settings in what the app registered with `actionsPlugin(config)`. */
import type { DeepPartial } from '@embedpdf/core';

import type { ActionsConfig, ActionsSettings } from './contract';

/** `config` without the script environment, which is no setting: what the settings register. */
export function registeredSettings(
  config: ActionsConfig | undefined,
): DeepPartial<ActionsSettings> | undefined {
  if (!config) return undefined;
  const { javascript } = config;
  return {
    policy: config.policy,
    triggers: config.triggers,
    openSequence: config.openSequence,
    javascript: javascript && { enabled: javascript.enabled, identity: javascript.identity },
  };
}
