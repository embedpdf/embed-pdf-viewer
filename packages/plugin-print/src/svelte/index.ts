export * from './hooks';
export * from './components';
export * from '@embedpdf/plugin-print';

import { createPluginPackage } from '@embedpdf/core';
import { PrintPluginPackage as BasePrintPackage } from '@embedpdf/plugin-print';
import { PrintFrame } from './components';

/**
 * Build a Svelte-flavoured package by adding the Svelte PrintFrame utility.
 * Keeps heavy logic inside the plugin; framework layer just wires the component.
 */
export const PrintPluginPackage = createPluginPackage(BasePrintPackage)
  .addUtility(PrintFrame)
  .build();
