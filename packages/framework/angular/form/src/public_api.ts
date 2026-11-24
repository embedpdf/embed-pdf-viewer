/**
 * @embedpdf/angular/form: PDF forms people fill in, and that your code reads, fills and builds.
 *
 *   withForm(config)          the plugin, for provideEmbedPdf()
 *   inject(EpdfForm)          the fields, filling, form data and building, as signals, methods
 *                             and streams
 *   form.valueOf(ref)         one field's value, as a signal
 *   form.controlOf(ref)       one field as a Reactive Forms FormControl
 *   form.widgetAnchorOf(ref)  an anchor for `<epdf-anchored>` that keeps UI on one box of a field
 *   <epdf-form-layer>         the fields on each page, as real HTML controls
 *   <ng-template [epdfFieldControl]="match" let-widget>
 *                             inside the layer: your own control for the boxes `match` picks
 */

// The plugin's types and helpers (`toFieldRef`), so app code has one import for the feature.
export * from '@embedpdf/plugin-form';
export { EpdfForm, withForm } from './form';
export type { FieldRefSource } from './form';
export { EpdfFormLayer } from './form-layer';
export { EpdfFieldControlTemplate } from './templates';
export type { EpdfFieldControlTemplateContext, FieldControlMatch } from './templates';
export type { FieldControlFrame } from '@embedpdf/web';
