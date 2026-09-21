import type { PluginContext } from '@embedpdf/core';

import type { ActionsAction, ActionsState } from '../model';

/** The plugin context every area receives — the kernel's, typed to this slice. */
export type ActionsContext = PluginContext<ActionsState, ActionsAction>;
