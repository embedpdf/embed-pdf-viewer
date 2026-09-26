import type { PluginContext } from '@embedpdf/core';

import type { RedactionState } from '../model';

/** The plugin context every area receives: the kernel's, typed to this plugin's state. */
export type RedactionContext = PluginContext<RedactionState>;
