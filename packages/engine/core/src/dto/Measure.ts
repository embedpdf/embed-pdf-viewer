import type { PdfPoint, PdfRect } from '../geometry/primitives';

export type MeasureFraction = 'decimal' | 'fraction' | 'round' | 'truncate';

/** ISO number format. Missing required fields in imported PDFs stay unavailable. */
export interface PdfNumberFormat {
  /** Literal unit label, including any intentional whitespace. */
  unit: string;
  /** Conversion from the preceding format's units (or the input units for the
   * first format). Absent when imported /C is missing or malformed; never defaults to 1. */
  conversion?: number;
  /** Last component's numeric representation; default decimal. */
  fraction?: MeasureFraction;
  /** Decimal denominator (1, 10, 100, …) or fractional denominator (e.g. 16). */
  precision?: number;
  /** Retain decimal zeros or the unreduced fraction denominator. */
  fixed?: boolean;
  /** Grouping separator; default comma, empty string disables grouping. */
  thousands?: string;
  /** Decimal separator; omitted or empty means dot. */
  decimal?: string;
  /** Spacing immediately before the unit label. */
  prefixSpacing?: string;
  /** Spacing immediately after the unit label. */
  suffixSpacing?: string;
  labelPosition?: 'suffix' | 'prefix';
}

/** Rectilinear /Measure. Empty arrays faithfully represent missing formats on import. */
export interface PdfMeasure {
  subtype: 'rectilinear';
  ratio?: string;
  /** X-axis conversion from PDF user-space units. */
  x: PdfNumberFormat[];
  /** When present, requires cyx to express Y distances in X-axis units. */
  y?: PdfNumberFormat[];
  /** Distance display formats, starting from the first X format's unit. */
  distance: PdfNumberFormat[];
  /** Area display formats, starting from the square of the first X format's unit. */
  area: PdfNumberFormat[];
  angle?: PdfNumberFormat[];
  slope?: PdfNumberFormat[];
  origin?: PdfPoint;
  /** Conversion from the first Y format's units into the first X format's units. */
  cyx?: number;
}

/** Read-only presence marker. Foreign dictionaries are preserved in the PDF. */
export interface PdfForeignMeasure {
  subtype: 'geospatial' | 'unknown';
}
export type PdfMeasurement = PdfMeasure | PdfForeignMeasure;
export interface PdfViewport {
  bbox: PdfRect;
  name?: string;
  measure?: PdfMeasurement;
}
export interface PageMeasurementViewport extends PdfViewport {
  owned: boolean;
}

/** What `page.measure.listViewports()` returns: the viewports in drawing order. */
export interface PageMeasurementViewportList {
  viewports: PageMeasurementViewport[];
}

export type LineIntent = 'line-arrow' | 'line-dimension';
export type PolygonIntent = 'polygon-cloud' | 'polygon-dimension';
export type PolylineIntent = 'polyline-dimension';
export interface LineDimensionCaption {
  enabled: boolean;
  position?: 'inline' | 'top';
  /** Displacement in directed line axes, in PDF units; not a page point. */
  offset?: { along: number; perpendicular: number };
}
export interface ShapeDimensionCaption {
  enabled: boolean;
  /** Absolute PDF user-space center. Absent = automatic; (0,0) is valid. */
  center?: PdfPoint;
}
export interface LineLeader {
  length: number;
  extension?: number;
  offset?: number;
}
export interface LineCaptionPatch {
  enabled?: boolean;
  position?: 'inline' | 'top' | null;
  offset?: LineDimensionCaption['offset'] | null;
}
export interface ShapeCaptionPatch {
  enabled?: boolean;
  center?: PdfPoint | null;
}
