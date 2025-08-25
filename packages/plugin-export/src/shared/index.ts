import { createPluginPackage } from '@embedpdf/core';
import { ExportPluginPackage as BaseExportPackage } from '@embedpdf/plugin-export';

import { Download } from './component';

export * from './hooks';
export * from './component';

export * from '@embedpdf/plugin-export';

export const ExportPluginPackage = createPluginPackage(BaseExportPackage)
  .addUtility(Download)
  .build();
