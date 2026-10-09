/**
 * @embedpdf/angular/runtime: the viewer and what every feature builds on.
 *
 *   provideEmbedPdf(config, ...features)    the viewer, as providers
 *   inject(EpdfViewer)                      its settings and status
 *   inject(EpdfDocuments), EpdfDocument     the documents, as methods, signals and streams
 *   [epdfDocumentScope], *epdfDocumentGate  which document a part of the template talks to
 *   pluginService(), EpdfPluginService      how a plugin's service is built
 *   EPDF_PAGE, injectPage()                 the page a layer draws on
 *   paintsPagePart(), injectPaintedParts()  which parts of a page its layers paint
 */

// The core's types and helpers, so app code has one import for the viewer.
export * from '@embedpdf/core';
// What a page with a viewer needs from the browser: handing bytes to the user as a download,
// and a font the engine draws with, for text you draw yourself.
export { mountWebFont, saveFile } from '@embedpdf/web';
export * from './errors';
export * from './config';
export * from './tokens';
export { EpdfKernelHost } from './kernel-host';
export type { PluginSettingsBinding } from './kernel-host';
export * from './capability';
export * from './service';
export * from './services';
export { provideEmbedPdf, EPDF_SCOPED_SERVICES } from './provide';
export * from './scope';
export * from './page-context';
export * from './page-layers';
export * from './dev';
export * from './theme';
