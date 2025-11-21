import { createPluginPackage } from '@embedpdf/core';
import { DocumentManagerPluginPackage as BaseDocumentManagerPackage } from '@embedpdf/plugin-document-manager';

import { FilePicker, DocumentContext, DocumentContent } from './components';

export * from './hooks';
export * from './components';

export * from '@embedpdf/plugin-document-manager';

export const DocumentManagerPluginPackage = createPluginPackage(BaseDocumentManagerPackage)
  .addUtility(FilePicker)
  .build();
