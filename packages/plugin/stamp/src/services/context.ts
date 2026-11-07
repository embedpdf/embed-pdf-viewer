import type { PluginContext } from '@embedpdf/core';

import type { StampSettings } from '../contract';
import type { StampModel } from '../model';

/** The plugin context every area receives, typed to the stamp state and settings. */
export type StampContext = PluginContext<StampModel, StampSettings>;
