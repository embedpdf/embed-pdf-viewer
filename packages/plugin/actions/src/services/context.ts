/** The context every area of the actions plugin receives: no session state, the actions settings. */
import type { PluginContext } from '@embedpdf/core';

import type { ActionsSettings } from '../contract';

export type ActionsContext = PluginContext<void, ActionsSettings>;
