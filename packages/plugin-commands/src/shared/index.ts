import { createPluginPackage } from '@embedpdf/core';
import { CommandsPluginPackage as BaseCommandsPackage } from '@embedpdf/plugin-commands';

import { KeyboardShortcuts } from './components';

export * from './hooks';
export * from './components';
export * from '@embedpdf/plugin-commands';

export const CommandsPluginPackage = createPluginPackage(BaseCommandsPackage)
  .addUtility(KeyboardShortcuts)
  .build();
