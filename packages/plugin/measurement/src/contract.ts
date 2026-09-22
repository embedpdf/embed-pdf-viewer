/**
 * @embedpdf/plugin-measurement/contract — the PUBLIC measurement vocabulary:
 * page scale, calibration, scale-aware readouts, and measurement creation.
 * Creating a measurement annotation is `annotation.create` with a
 * measurement tool; this plugin adds the page-scale sugar around it.
 */
import type { EventHook, OperationOptions } from '@embedpdf/core';
import type { Point } from '@embedpdf/core-geometry';
import type {
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

/** One page, several pages, or every page of the document. */
export type PageTarget = PageRef | readonly PageRef[] | 'all';

export interface ScalePreset {
  id: string;
  label: string;
  paper: number;
  real: number;
  unit: LengthUnit;
}

/** `measurementPlugin(config)`. */
export interface MeasurementConfig {
  /** Fallback scale for uncalibrated pages. Default `'metric'`. */
  defaultScale?: 'metric' | 'imperial' | PdfMeasure;
  /** The scale picker. Default: metric 1:1…1:200, imperial ¼″ and ⅛″. */
  presets?: readonly ScalePreset[];
}

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
  page: PageRef;
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
  page: PageRef;
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

export interface MeasurementCapability {
  // ── twins ──
  /** May write a page scale (`doc.annotate.modify`). */
  canCalibrate(): boolean;
  /** Create authority and a ready scale on the page. */
  canMeasure(page: PageRef): boolean;

  // ── reading ──
  /** The resolved scale, its source and readiness. Reference-stable while unchanged. */
  getPageScale(page: PageRef): PageScale;
  /** Load the page's viewports. Resolves at once when already known. */
  ensureLoaded(page: PageRef, options?: OperationOptions): Promise<void>;
  /** A scale change is in flight. */
  isBusy(): boolean;
  /** The reports of the last scale change. */
  listLastReports(): readonly ScaleChangeReport[];
  listPresets(): readonly ScalePreset[];
  listUnits(): readonly LengthUnit[];
  listAreaUnits(): readonly AreaUnit[];
  /** The formatted measurement of a measurement annotation. */
  getReadout(ref: AnnotationRef): MeasurementReadout | MeasurementUnavailable;
  /** A distance in the page's scale — pure conversion, no annotation. */
  measureDistance(
    page: PageRef,
    from: Point,
    to: Point,
  ): MeasurementReadout | MeasurementUnavailable;
  /** An area in the page's scale — pure conversion, no annotation. */
  measureArea(
    page: PageRef,
    vertices: readonly Point[],
  ): MeasurementReadout | MeasurementUnavailable;
  /** Two points captured, awaiting a length. */
  getCalibrationRequest(): CalibrationRequest | null;

  // ── the scale ──
  setScale(
    pages: PageTarget,
    measure: PdfMeasure,
    options?: ScaleChangeOptions,
  ): Promise<readonly ScaleChangeReport[]>;
  /** Derive a scale from a known length between two page points. `applyTo` widens the write (default: the input page). */
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
  /** Create a measurement annotation with the page's scale. Rejects `not-ready` before the scale is known. */
  createMeasurement(
    input: CreateMeasurementInput,
    options?: OperationOptions,
  ): Promise<AnnotationRef>;

  // ── calibration flow ──
  /** Arm the calibrate tool (two points, then `onCalibrationRequested`). */
  startCalibration(): void;
  /** Drop the pending request. */
  dismissCalibration(): void;

  // ── events ──
  readonly onScaleChanged: EventHook<MeasurementScaleChangedEvent>;
  readonly onCalibrationRequested: EventHook<CalibrationRequestedEvent>;
  readonly onCalibrationCompleted: EventHook<CalibrationCompletedEvent>;
  readonly onCalibrationDismissed: EventHook<CalibrationDismissedEvent>;
}
