/** The package token, created once here and re-exported by `contract.ts`. */
import { createCapabilityToken } from '@embedpdf/core';

import type { MeasurementCapability } from './contract';

export const MeasurementToken = createCapabilityToken<MeasurementCapability>('measurement', {
  hint: `add measurementPlugin() from '@embedpdf/plugin-measurement' to your plugins list`,
});
