import type { PluginContext } from '@embedpdf/core';

import type { MeasurementState } from '../model';

/** The plugin context every area receives: the kernel's, typed to this plugin's state. */
export type MeasurementContext = PluginContext<MeasurementState>;
