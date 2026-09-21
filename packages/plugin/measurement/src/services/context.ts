import type { PluginContext } from '@embedpdf/core';

import type { MeasurementAction, MeasurementState } from '../model';

/** The plugin context every area receives — the kernel's, typed to this slice. */
export type MeasurementContext = PluginContext<MeasurementState, MeasurementAction>;
