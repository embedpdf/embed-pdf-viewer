import type { PluginContext } from '@embedpdf/core';

import type { FormState } from '../model';

/** The plugin context every area receives, typed to this plugin's state. */
export type FormContext = PluginContext<FormState>;
