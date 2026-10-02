/**
 * @embedpdf/angular/link: links that work.
 *
 *   withLink()                                 the plugin, for provideEmbedPdf()
 *   inject(EpdfLink)                           a page's links, follow one from code, the events
 *   <epdf-link-layer>                          the links on each page, as real anchors
 *   <ng-template epdfLink let-link let-native="native">    draw a link yourself
 */

// The plugin's types and helpers, so app code has one import for the feature.
export * from '@embedpdf/plugin-link';
export { EpdfLink, withLink } from './link';
export { EpdfLinkLayer, EpdfLinkTemplate } from './link-layer';
export type { EpdfLinkTemplateContext } from './link-layer';
