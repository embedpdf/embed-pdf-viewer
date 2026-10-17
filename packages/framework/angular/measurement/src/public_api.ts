/**
 * @embedpdf/angular/measurement: distances, perimeters and areas at a real-world scale.
 *
 *   withMeasurement(options)        the plugin, for provideEmbedPdf()
 *   inject(EpdfMeasurement)         setPreset(), calibrate(), createMeasurement(), busy(),
 *                                   calibrationRequest(), scaleOf(page), readoutOf(ref), the events
 */

// The plugin's types and helpers, so app code has one import for the feature.
export * from '@embedpdf/plugin-measurement';
export * from './measurement';
