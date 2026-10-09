/** The package token, created once here and re-exported by `contract.ts`. */
import { createCapabilityToken } from '@embedpdf/core';

import type { MeasurementCapability } from './contract';

export const MeasurementToken = createCapabilityToken<MeasurementCapability>('measurement', {
  hint: `add measurementPlugin() from '@embedpdf/plugin-measurement' to your plugins list`,
  // Without a document, an adapter's stand-in rejects these with `not-ready`, as the
  // capability would; the type asks for every member that returns a promise.
  promises: {
    ensureLoaded: true,
    setScale: true,
    calibrate: true,
    setUnit: true,
    setAreaUnit: true,
    setPrecision: true,
    setPreset: true,
    clearScale: true,
    createMeasurement: true,
  },
});
