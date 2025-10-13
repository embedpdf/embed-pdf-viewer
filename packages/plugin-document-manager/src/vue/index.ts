import { createPluginPackage } from '@embedpdf/core';
import { DocumentManagerPluginPackage as BaseDocumentManagerPackage } from '@embedpdf/plugin-document-manager';
import { FilePicker } from './components';

export * from './hooks';
export * from './components';
export * from '@embedpdf/plugin-document-manager';

// A convenience package that auto-registers our utilities
export const DocumentManagerPackage = createPluginPackage(BaseDocumentManagerPackage)
  .addUtility(FilePicker) // headless utility consumers can mount once and call cap.openFileDialog()
  .build();
