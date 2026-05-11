export * from '@embedpdf/snippet';
export {
  EMBEDPDF_VIEWER_DEFAULT_CONFIG,
  provideEmbedPdfViewerConfig,
  provideEmbedPdfViewerDefaults,
} from './pdf-viewer.config';
export { PDFViewer, type EmbedPdfThemeChangeEvent } from './pdf-viewer.component';
export {
  createDocumentScopeSignal,
  createPluginCapabilitySignal,
  type DocumentScope,
  type PluginCapability,
} from './plugin-signals';
