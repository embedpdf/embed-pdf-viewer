import type { PluginContext } from '@embedpdf/core';

import type { FormSettings } from '../contract';
import type { FormState } from '../model';

/** The plugin context every area receives, typed to this plugin's state and settings. */
export type FormContext = PluginContext<FormState, FormSettings>;
