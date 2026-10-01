/**
 * @embedpdf/plugin-measurement/contract: the public measurement vocabulary:
 * page scale, calibration, scale-aware readouts, and measurement creation.
 * Creating a measurement annotation is `annotation.create` with a
 * measurement tool; this plugin adds the page-scale sugar around it.
 */
import type { EventHook, OperationOptions, SettingsApi } from '@embedpdf/core';
import type { Point } from '@embedpdf/core-geometry';
import type {
  Annotation,
  AnnotationRef,
  AreaUnit,
  LengthUnit,
  MeasurementReadout,
  MeasurementUnavailable,
  PageRef,
  PdfMeasure,
  PdfMeasurement,
  SerializedEngineError,
} from '@embedpdf/engine-core/runtime';
import type { RecalibrationReport } from '@embedpdf/plugin-annotation/contract/host';

import { DEFAULT_PRESETS } from './scale';

export { MeasurementToken } from './token';
export type { RecalibrationReport } from '@embedpdf/plugin-annotation/contract/host';
export type {
  AnnotationRef,
  AreaUnit,
  LengthUnit,
  MeasurementReadout,
  MeasurementUnavailable,
  PdfMeasure,
} from '@embedpdf/engine-core/runtime';

/** One page, several pages, or every page of the document: each a ref or an index. */
export type PageTarget = PageRef | number | readonly (PageRef | number)[] | 'all';

export interface ScalePreset {
  id: string;
  label: string;
  paper: number;
  real: number;
  unit: LengthUnit;
}

/**
 * The measurement plugin's settings. `measurementPlugin(config)` registers
 * them over {@link MEASUREMENT_DEFAULTS}, and `updateSettings()` changes them
 * for every document while the app runs.
 */
export interface MeasurementSettings {
  /**
   * The scale of a page that has none: 1:1 in meters (`'metric'`) or in
   * feet (`'imperial'`), or a scale of your own.
   */
  readonly defaultScale: 'metric' | 'imperial' | PdfMeasure;
  /** The scales `listPresets()` offers. */
  readonly presets: readonly ScalePreset[];
}

/** What the measurement settings are when the app registers none. */
export const MEASUREMENT_DEFAULTS: MeasurementSettings = {
  defaultScale: 'metric',
  presets: DEFAULT_PRESETS,
};

/** What `measurementPlugin(config)` takes: either setting, each a whole value. */
export type MeasurementConfig = Partial<MeasurementSettings>;

export interface ScaleChangeOptions extends OperationOptions {
  /** Re-measure the page's measurement annotations with the new scale. Default true. */
  recalculate?: boolean;
}

export interface PageScale {
  measure: PdfMeasurement | null;
  source: 'owned' | 'foreign' | 'default';
  /** The page's viewports are known. */
  ready: boolean;
  /** The engine can persist a scale into the document. */
  persistent: boolean;
  /** Why the last read of the page's viewports failed; the last known viewports stay in effect. */
  error?: SerializedEngineError;
}

/** Two points captured by the calibrate tool, awaiting the real length. Page space. */
export interface CalibrationRequest {
  page: PageRef;
  from: Point;
  to: Point;
  /** The captured length in PDF user space (the scale is derived from it). */
  userSpaceLength: number;
}

export interface CalibrateInput {
  /** The page, as a ref or an index. */
  page: PageRef | number;
  /** The two ends of the known length, in page space. */
  from: Point;
  to: Point;
  /** The real-world length between the two points. */
  distance: { value: number; unit: LengthUnit };
}

/** A failed viewport write is reported per page for a multi-page change.
 *  Single-page failures reject before any annotation write. */
export type ScaleChangeReport =
  | (RecalibrationReport & { scaleError?: never })
  | {
      page: PageRef;
      scale?: never;
      error?: never;
      updated: [];
      skipped: [];
      failed: [];
      scaleError: SerializedEngineError;
    };

export type MeasurementKind = 'distance' | 'perimeter' | 'area';

export interface CreateMeasurementInput {
  kind: MeasurementKind;
  /** The page, as a ref or an index. */
  page: PageRef | number;
  /** Page-space points: two for a distance, the vertices otherwise. */
  points: readonly Point[];
  /** The authoring tool whose defaults apply (defaults to the kind's own tool). */
  tool?: string;
}

// ── events ──
export interface MeasurementScaleChangedEvent {
  readonly page: PageRef;
  readonly report: ScaleChangeReport;
}
export interface CalibrationRequestedEvent {
  readonly request: CalibrationRequest;
}
export interface CalibrationCompletedEvent {
  readonly page: PageRef;
}
export type CalibrationDismissedEvent = Record<string, never>;

/**
 * Page scales, calibration and measurement readouts for one document. A page
 * argument is a ref or an index: a read given a page that isn't there
 * answers empty, a verb refuses it with `not-found`. Every async verb takes
 * a `signal`. The settings belong to the plugin, not to a document: a change
 * reaches every open document.
 */
export interface MeasurementCapability extends SettingsApi<MeasurementSettings> {
  // ── twins ──
  /** May write a page scale and calibrate (`doc.annotate.modify`). */
  canCalibrate(): boolean;
  /** May measure on the page: `annotations:create`, and the page's scale has loaded. */
  canMeasure(page: PageRef | number): boolean;

  // ── reading ──
  /** The resolved scale, its source and readiness. Reference-stable while unchanged. */
  getPageScale(page: PageRef | number): PageScale;
  /** Load the page's viewports. Resolves at once when already known. Rejects `not-found`. */
  ensureLoaded(page: PageRef | number, options?: OperationOptions): Promise<void>;
  /** A scale change is in flight. */
  isBusy(): boolean;
  /** The reports of the last scale change, one per page. */
  listLastReports(): readonly ScaleChangeReport[];
  listPresets(): readonly ScalePreset[];
  listUnits(): readonly LengthUnit[];
  listAreaUnits(): readonly AreaUnit[];
  /** The formatted measurement of a measurement annotation. */
  getReadout(ref: AnnotationRef): MeasurementReadout | MeasurementUnavailable;
  /** A distance between two page-space points in the page's scale: a pure conversion, no annotation. */
  measureDistance(
    page: PageRef | number,
    from: Point,
    to: Point,
  ): MeasurementReadout | MeasurementUnavailable;
  /** The area of a page-space polygon in the page's scale: a pure conversion, no annotation. */
  measureArea(
    page: PageRef | number,
    vertices: readonly Point[],
  ): MeasurementReadout | MeasurementUnavailable;
  /** Two points captured, awaiting a length. */
  getCalibrationRequest(): CalibrationRequest | null;

  // ── the scale ──
  // Every scale change rejects `permission-denied` without
  // `doc.annotate.modify` (see `canCalibrate`), and `not-found` for a page
  // that isn't in the document.
  setScale(
    pages: PageTarget,
    measure: PdfMeasure,
    options?: ScaleChangeOptions,
  ): Promise<readonly ScaleChangeReport[]>;
  /** Derive a scale from a known length between two page points. `applyTo` widens the write (default: the input page). Fires `onCalibrationCompleted`. */
  calibrate(
    input: CalibrateInput,
    options?: ScaleChangeOptions & { applyTo?: PageTarget },
  ): Promise<readonly ScaleChangeReport[]>;
  setUnit(
    pages: PageTarget,
    unit: LengthUnit,
    options?: ScaleChangeOptions,
  ): Promise<readonly ScaleChangeReport[]>;
  setAreaUnit(
    pages: PageTarget,
    unit: AreaUnit,
    options?: ScaleChangeOptions,
  ): Promise<readonly ScaleChangeReport[]>;
  setPrecision(
    pages: PageTarget,
    precision: number,
    options?: ScaleChangeOptions,
  ): Promise<readonly ScaleChangeReport[]>;
  /** A scale from the `presets` setting. Rejects `not-found` for an unknown preset. */
  setPreset(
    pages: PageTarget,
    presetId: string,
    options?: ScaleChangeOptions,
  ): Promise<readonly ScaleChangeReport[]>;
  /** Back to the default scale (the owned viewport is removed). */
  clearScale(
    pages: PageTarget,
    options?: ScaleChangeOptions,
  ): Promise<readonly ScaleChangeReport[]>;

  // ── measuring ──
  /**
   * Create a measurement annotation with the page's scale and the tool's
   * style. Resolves `{ annotation }`. Rejects `permission-denied` without
   * `annotations:create`, `not-ready` before the scale is known,
   * `not-found` for a page that isn't in the document.
   */
  createMeasurement(
    input: CreateMeasurementInput,
    options?: OperationOptions,
  ): Promise<{ annotation: Annotation }>;

  // ── calibration flow ──
  /**
   * Arm the calibrate tool (two points, then `onCalibrationRequested`).
   * Throws `permission-denied` without `doc.annotate.modify` (see `canCalibrate`).
   */
  startCalibration(): void;
  /** Drop the pending request. Fires `onCalibrationDismissed` when there was one. */
  dismissCalibration(): void;

  // ── events ──
  readonly onScaleChanged: EventHook<MeasurementScaleChangedEvent>;
  readonly onCalibrationRequested: EventHook<CalibrationRequestedEvent>;
  readonly onCalibrationCompleted: EventHook<CalibrationCompletedEvent>;
  readonly onCalibrationDismissed: EventHook<CalibrationDismissedEvent>;
}
