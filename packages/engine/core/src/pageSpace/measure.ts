import type { PageCoordinates } from './coordinates';
import type { PdfMeasurement, PageMeasurementViewport } from '../dto/Measure';
import { pageBoxOf, pagePointOf, pdfPointOf, type PagePoint } from '../geometry/pageSpace';
import type { PdfPoint, PdfRect } from '../geometry/primitives';

const withOrigin = <Measure extends PdfMeasurement>(
  measure: Measure,
  convert: (origin: PdfPoint) => PdfPoint,
): Measure =>
  measure.subtype === 'rectilinear' && measure.origin
    ? { ...measure, origin: convert(measure.origin) }
    : measure;

/** A scale in page space: its origin (`/O`) is a place on the page. */
export function pageMeasureOf<Measure extends PdfMeasurement>(
  measure: Measure,
  visible: PdfRect,
): Measure {
  return withOrigin(measure, (origin) => pagePointOf(origin, visible));
}

/** A page-space scale in the file's coordinates. */
export function pdfMeasureOf<Measure extends PdfMeasurement>(
  measure: Measure,
  visible: PdfRect,
): Measure {
  return withOrigin(measure, (origin) => pdfPointOf(origin as PagePoint, visible));
}

/** A page's measurement viewports in page space. */
export function pageViewportsOf(
  viewports: readonly PageMeasurementViewport[],
  visible: PdfRect,
): PageMeasurementViewport<PageCoordinates>[] {
  return viewports.map((viewport) => ({
    ...viewport,
    bbox: pageBoxOf(viewport.bbox, visible),
    measure: viewport.measure ? pageMeasureOf(viewport.measure, visible) : null,
  }));
}
