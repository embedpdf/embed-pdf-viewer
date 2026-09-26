import type { PluginContext } from '@embedpdf/core';

import type { StampState } from '../model';

/** The plugin context every area receives, typed to the stamp state. */
export type StampContext = PluginContext<StampState>;
