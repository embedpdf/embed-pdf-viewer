/**
 * @embedpdf/angular/page-view: one page on its own, with no Stage.
 *
 *   <epdf-page-view [page] [width]>     the page, drawn with the layers between its tags
 *   <ng-template epdfFallback>          what shows until the document and the page are there
 *   <ng-template epdfPageChrome>        what goes around the page: the Stage's own template
 */
export * from './page-view';
export { EpdfPageChrome } from '@embedpdf/angular/stage';
export type { EpdfPageTemplateContext } from '@embedpdf/angular/stage';
