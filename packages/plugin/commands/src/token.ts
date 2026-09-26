/** The package token — created once here; `contract.ts` re-exports it and
 *  `host-contract.ts` widens it to the host capability. */
import { createCapabilityToken } from '@embedpdf/core';

import type { CommandsCapability } from './contract';

export const CommandsToken = createCapabilityToken<CommandsCapability>('commands', {
  hint: `add commandsPlugin() from '@embedpdf/plugin-commands' to your plugins list`,
});
