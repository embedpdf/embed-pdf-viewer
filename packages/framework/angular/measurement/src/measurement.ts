/**
 * The measurement plugin's service and feature:
 *
 *   withMeasurement(options)     the plugin, for provideEmbedPdf()
 *   inject(EpdfMeasurement)      the scales, calibration and measuring, the State table as
 *                                signals (`busy()`, `calibrationRequest()`, `lastReports()`), a
 *                                page's scale (`scaleOf(page)`), a measurement's readout
 *                                (`readoutOf(ref)`), the events as streams, and the settings
 */
import { computed, Injectable, type Signal } from '@angular/core';
import type { PageRef } from '@embedpdf/core';
import { pluginService, type EmbedPdfFeature } from '@embedpdf/angular/runtime';
import {
  measurementPlugin,
  measurementState,
  MeasurementToken,
  NO_PAGE_SCALE,
  NO_READOUT,
  type AnnotationRef,
  type MeasurementConfig,
  type MeasurementReadout,
  type MeasurementUnavailable,
  type PageScale,
} from '@embedpdf/plugin-measurement';

/** A page, or a function that gives the page to follow. */
type PageInput<Page> = Page | (() => Page);

/**
 * Measurements of the document in scope (`[epdfDocumentScope]`), else the active one: the
 * Measurements page's methods, its State table as signals, a page's scale and a measurement's
 * readout as signals, the events as streams (`scaleChanged$`, `calibrationRequested$`, …), and
 * the settings. Without a document the signals read empty and the methods refuse with
 * `not-ready`.
 */
@Injectable({ providedIn: 'root' })
export class EpdfMeasurement extends pluginService({
  name: 'EpdfMeasurement',
  feature: 'withMeasurement()',
  token: MeasurementToken,
  state: measurementState,
  methods: [
    'listPresets',
    'setPreset',
    'setScale',
    'clearScale',
    'startCalibration',
    'calibrate',
    'dismissCalibration',
    'setUnit',
    'setAreaUnit',
    'setPrecision',
    'listUnits',
    'listAreaUnits',
    'getPageScale',
    'ensureLoaded',
    'getReadout',
    'measureDistance',
    'measureArea',
    'createMeasurement',
    'canCalibrate',
    'canMeasure',
    'isBusy',
    'getCalibrationRequest',
    'listLastReports',
  ],
  events: [
    'onScaleChanged',
    'onCalibrationRequested',
    'onCalibrationCompleted',
    'onCalibrationDismissed',
  ],
}) {
  /**
   * A page's scale (its ref or its index), for a scale bar or a "1:100" badge: where it came
   * from, and whether it has loaded. Pass a function (`() => this.page().ref`) and it follows
   * the page you show; `null` (no page) answers `null`, so a badge can stay without inventing a
   * page. It changes only when that page's scale does.
   */
  scaleOf(page: PageInput<PageRef | number>): Signal<PageScale>;
  scaleOf(page: PageInput<PageRef | number | null>): Signal<PageScale | null>;
  scaleOf(page: PageInput<PageRef | number | null>): Signal<PageScale | null> {
    const pageOf = typeof page === 'function' ? page : () => page;
    // The plugin hands out the same scale until it changes. With no document there is none to
    // read, but a page asked for still gets an answer: a scale that hasn't loaded.
    const scale = this.binding.select(
      (measurement) => {
        const wanted = pageOf();
        return wanted === null ? NO_PAGE_SCALE : measurement.getPageScale(wanted);
      },
      NO_PAGE_SCALE,
      Object.is,
    );
    return computed(() => (pageOf() === null ? null : scale()));
  }

  /**
   * A measurement's `{ kind, value, label }`, or `{ unavailable }` with why there's none (no
   * scale, a scale from map software). Pass a function (`this.annotation`, an input) and it
   * follows the measurement you show. The plugin hands out the same readout until the
   * measurement changes, so it changes only then.
   */
  readoutOf(
    ref: AnnotationRef | (() => AnnotationRef),
  ): Signal<MeasurementReadout | MeasurementUnavailable> {
    const refOf = typeof ref === 'function' ? ref : () => ref;
    return this.binding.select<MeasurementReadout | MeasurementUnavailable>(
      (measurement) => measurement.getReadout(refOf()),
      NO_READOUT,
    );
  }
}

/** Measurements, with their settings: `withMeasurement({ defaultScale: 'imperial' })`. */
export function withMeasurement(options?: MeasurementConfig): EmbedPdfFeature {
  return { plugins: [measurementPlugin(options)], services: [EpdfMeasurement] };
}
