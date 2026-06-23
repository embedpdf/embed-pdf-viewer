export { SpreadMode, ZoomMode, deserializeEntries, serializeEntries } from '@embedpdf/snippet';
export type {
  AnnotationPlugin,
  CommandButtonItem,
  CommandsPlugin,
  DocumentManagerPlugin,
  EmbedPdfContainer,
  ExportPlugin,
  FormFieldInfo,
  FormPlugin,
  GroupItem,
  I18nPlugin,
  PanPlugin,
  PDFViewerConfig,
  PluginRegistry,
  PrintPlugin,
  RotatePlugin,
  ScrollCapability,
  ScrollPlugin,
  SelectionPlugin,
  SignaturePlugin,
  SpreadPlugin,
  ThemeConfig,
  ThemePreference,
  ToolbarItem,
  UIPlugin,
  ZoomPlugin,
} from '@embedpdf/snippet';
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
