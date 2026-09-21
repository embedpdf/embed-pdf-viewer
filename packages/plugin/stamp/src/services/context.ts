import type { PluginContext } from '@embedpdf/core';

import type { StampAction, StampState } from '../model';

/** The plugin context every area receives — the kernel's, typed to this slice. */
export type StampContext = PluginContext<StampState, StampAction>;
