/** The package token — created once here; `contract.ts` re-exports it and
 *  `host-contract.ts` carries it for siblings. */
import { createCapabilityToken } from '@embedpdf/core';

import type { MeasurementCapability } from './contract';

export const MeasurementToken = createCapabilityToken<MeasurementCapability>('measurement', {
  hint: `add measurementPlugin() from '@embedpdf/plugin-measurement' to your plugins list`,
});
