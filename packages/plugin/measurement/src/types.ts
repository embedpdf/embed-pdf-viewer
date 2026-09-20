import { createCapabilityToken } from '@embedpdf/core';
import type {
  AnnotationRef,
  AreaUnit,
  LengthUnit,
  MeasurementReadout,
  MeasurementUnavailable,
  PageMeasurementViewport,
  PageRef,
  PdfMeasure,
  PdfMeasurement,
  PdfPoint,
  SerializedEngineError,
} from '@embedpdf/engine-core/runtime';
import type { RecalibrationReport } from '@embedpdf/plugin-annotation/contract/host';

export type { RecalibrationReport } from '@embedpdf/plugin-annotation/contract/host';

export type {
  LengthUnit,
  AreaUnit,
  PdfMeasure,
  MeasurementReadout,
  MeasurementUnavailable,
} from '@embedpdf/engine-core/runtime';

export interface ScalePreset {
  id: string;
  label: string;
  paper: number;
  real: number;
  unit: LengthUnit;
}

export interface MeasurementConfig {
  defaultScale?: 'metric' | 'imperial' | PdfMeasure;
  presets?: ScalePreset[];
}

export interface SetScaleOptions {
  recalculate?: boolean;
  allPages?: boolean;
}

export interface PageScale {
  measure: PdfMeasurement | null;
  source: 'owned' | 'foreign' | 'default';
  ready: boolean;
  persistent: boolean;
  error?: SerializedEngineError;
}

export interface CalibrationRequest {
  page: PageRef;
  from: PdfPoint;
  to: PdfPoint;
  userSpaceLength: number;
}
/** A failed viewport write is reported per page for an all-pages operation.
 * Single-page viewport failures reject before any annotation write. */
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

export interface MeasurementState {
  pages: Record<number, { viewports: PageMeasurementViewport[]; scale: PageScale }>;
  pending: number;
  calibration: CalibrationRequest | null;
  reports: ScaleChangeReport[];
}

export type MeasurementAction =
  | { type: 'PAGE_SCALE'; page: PageRef; viewports: PageMeasurementViewport[]; scale: PageScale }
  | { type: 'PENDING'; delta: number }
  | { type: 'CALIBRATION'; request: CalibrationRequest | null }
  | { type: 'REPORTS'; reports: ScaleChangeReport[] };

export interface MeasurementCapability {
  canCalibrate(): boolean;
  canMeasure(page: PageRef): boolean;
  pageScale(page: PageRef): PageScale;
  isBusy(): boolean;
  lastReports(): ScaleChangeReport[];
  prepare(page: PageRef): Promise<void>;
  setPageScale(
    page: PageRef,
    measure: PdfMeasure,
    opts?: SetScaleOptions,
  ): Promise<ScaleChangeReport[]>;
  calibrate(
    page: PageRef,
    from: PdfPoint,
    to: PdfPoint,
    real: { value: number; unit: LengthUnit },
    opts?: SetScaleOptions,
  ): Promise<ScaleChangeReport[]>;
  setUnit(
    page: PageRef | 'all',
    unit: LengthUnit,
    areaUnit?: AreaUnit,
    opts?: SetScaleOptions,
  ): Promise<ScaleChangeReport[]>;
  setPrecision(
    page: PageRef | 'all',
    precision: number,
    opts?: SetScaleOptions,
  ): Promise<ScaleChangeReport[]>;
  setPreset(page: PageRef, id: string, opts?: SetScaleOptions): Promise<ScaleChangeReport[]>;
  presets(): readonly ScalePreset[];
  units(): readonly LengthUnit[];
  areaUnits(): readonly AreaUnit[];
  setAreaUnit(
    page: PageRef | 'all',
    unit: AreaUnit,
    options?: SetScaleOptions,
  ): Promise<ScaleChangeReport[]>;
  readout(ref: AnnotationRef): MeasurementReadout | MeasurementUnavailable;
  startCalibration(): void;
  calibrationRequest(): CalibrationRequest | null;
  dismissCalibration(): void;
  onCalibrationRequested(cb: (request: CalibrationRequest) => void): () => void;
  onScaleChanged(cb: (event: { page: PageRef; report: ScaleChangeReport }) => void): () => void;
}

export const MeasurementToken = createCapabilityToken<MeasurementCapability>('measurement');
