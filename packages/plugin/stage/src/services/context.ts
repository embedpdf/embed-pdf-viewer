import type { PluginContext } from '@embedpdf/core';

import type { StageAction, StageState } from '../model';

/** The plugin context every area receives. The kernel-free test harness
 *  builds one by hand, so only `PluginContext` members are used. */
export type StageContext = PluginContext<StageState, StageAction>;
