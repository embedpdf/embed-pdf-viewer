import { createPluginPackage } from '@embedpdf/core';
import { PanPluginPackage as BasePanPackage } from '@embedpdf/plugin-pan';

import { PanMode } from './components';

export * from './hooks';
export * from './components';
export * from '@embedpdf/plugin-pan';

export const PanPluginPackage = createPluginPackage(BasePanPackage).addUtility(PanMode).build();
