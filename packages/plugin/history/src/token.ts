/** The package token: created once here, and re-exported by `contract.ts`. */
import { createCapabilityToken } from '@embedpdf/core';

import type { HistoryCapability } from './contract';

export const HistoryToken = createCapabilityToken<HistoryCapability>('history', {
  hint: "add historyPlugin() from '@embedpdf/plugin-history' to your plugins list",
});
