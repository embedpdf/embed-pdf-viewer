import {
  mapAnnotationActions,
  mapLinkTarget,
  pageDestinationOf,
  pdfDestinationOf,
  type PageDestination,
  type VisibleBoxOf,
} from './destinations';
import { pageMeasureOf, pdfMeasureOf } from './measure';
import { ANNOTATION_FIELD_SPACES, type MeasuredFieldSpace } from '../annotation/field-spaces';
import type {
  AnnotationDTO,
  AnnotationDraft,
  AnnotationPatch,
  PageAnnotationDTO,
  PageAnnotationDraft,
  PageAnnotationPatch,
} from '../annotation/kinds';
import type { AnnotationSubtype } from '../annotation/subtype';
import type { PdfMeasurement } from '../dto/Measure';
import type { PdfAnnotationActions } from '../dto/PdfAction';
import type { PdfLinkTarget } from '../dto/PdfLinkTarget';
import {
  pageBoxOf,
  pagePointOf,
  pagePointOfTopLeft,
  pageQuadOf,
  pdfPointOf,
  pdfQuadOf,
  pdfRectOf,
  pdfTopLeftOf,
  type PageBox,
  type PagePoint,
  type PageQuad,
} from '../geometry/pageSpace';
import type { PdfPoint, PdfQuad, PdfRect, PdfTopLeft } from '../geometry/primitives';

/**
 * Annotation values between the file's coordinates and page space, field by
 * field, by what each field holds (`ANNOTATION_FIELD_SPACES`, kept equal to
 * the declarations). Places on the annotation's page are measured from that
 * page's visible box; a destination from the box of the page it goes to.
 */
interface Frame {
  /** The visible box of the annotation's page, in the file's coordinates. */
  visible: PdfRect;
  boxOf: VisibleBoxOf;
}

type Converter = (value: never, frame: Frame) => unknown;

const TO_PAGE: Record<MeasuredFieldSpace, Converter> = {
  length: (value) => value,
  point: (point: PdfPoint, { visible }) => pagePointOf(point, visible),
  points: (points: PdfPoint[], { visible }) => points.map((point) => pagePointOf(point, visible)),
  strokes: (strokes: PdfPoint[][], { visible }) =>
    strokes.map((stroke) => stroke.map((point) => pagePointOf(point, visible))),
  box: (rect: PdfRect, { visible }) => pageBoxOf(rect, visible),
  quads: (quads: PdfQuad[], { visible }) => quads.map((quad) => pageQuadOf(quad, visible)),
  linePoints: (line: { start: PdfPoint; end: PdfPoint }, { visible }) => ({
    start: pagePointOf(line.start, visible),
    end: pagePointOf(line.end, visible),
  }),
  calloutLine: (points: PdfPoint[], { visible }) =>
    points.map((point) => pagePointOf(point, visible)),
  topLeft: (topLeft: PdfTopLeft, { visible }) => pagePointOfTopLeft(topLeft, visible),
  measure: (measure: PdfMeasurement, { visible }) => pageMeasureOf(measure, visible),
  linkTarget: (target: PdfLinkTarget, { boxOf }) =>
    mapLinkTarget(target, (destination) => pageDestinationOf(destination, boxOf)),
  actions: (actions: PdfAnnotationActions, { boxOf }) =>
    mapAnnotationActions(actions, (destination) => pageDestinationOf(destination, boxOf)),
};

const TO_PDF: Record<MeasuredFieldSpace, Converter> = {
  length: (value) => value,
  point: (point: PagePoint, { visible }) => pdfPointOf(point, visible),
  points: (points: PagePoint[], { visible }) => points.map((point) => pdfPointOf(point, visible)),
  strokes: (strokes: PagePoint[][], { visible }) =>
    strokes.map((stroke) => stroke.map((point) => pdfPointOf(point, visible))),
  box: (box: PageBox, { visible }) => pdfRectOf(box, visible),
  quads: (quads: PageQuad[], { visible }) => quads.map((quad) => pdfQuadOf(quad, visible)),
  linePoints: (line: { start: PagePoint; end: PagePoint }, { visible }) => ({
    start: pdfPointOf(line.start, visible),
    end: pdfPointOf(line.end, visible),
  }),
  calloutLine: (points: PagePoint[], { visible }) =>
    points.map((point) => pdfPointOf(point, visible)),
  topLeft: (point: PagePoint, { visible }) => pdfTopLeftOf(point, visible),
  measure: (measure: PdfMeasurement, { visible }) => pdfMeasureOf(measure, visible),
  linkTarget: (target: PdfLinkTarget<PageDestination>, { boxOf }) =>
    mapLinkTarget(target, (destination) => pdfDestinationOf(destination, boxOf)),
  actions: (actions: PdfAnnotationActions<PageDestination>, { boxOf }) =>
    mapAnnotationActions(actions, (destination) => pdfDestinationOf(destination, boxOf)),
};

/** The measured fields of a kind; a kind the engine doesn't know has the base fields. */
const spacesOf = (subtype: string): Readonly<Record<string, MeasuredFieldSpace>> =>
  ANNOTATION_FIELD_SPACES[subtype as AnnotationSubtype] ?? ANNOTATION_FIELD_SPACES.unsupported;

function convertFields(
  subtype: string,
  value: object,
  frame: Frame,
  converters: Record<MeasuredFieldSpace, Converter>,
): Record<string, unknown> {
  const spaces = spacesOf(subtype);
  return Object.fromEntries(
    Object.entries(value).map(([name, field]) => {
      const space = spaces[name];
      return [name, space && field != null ? converters[space](field as never, frame) : field];
    }),
  );
}

/** A read in page space. `visible` is its page's visible box, in the file's coordinates. */
export function pageAnnotationOf(
  annotation: AnnotationDTO,
  visible: PdfRect,
  boxOf: VisibleBoxOf,
): PageAnnotationDTO {
  return convertFields(
    annotation.subtype,
    annotation,
    { visible, boxOf },
    TO_PAGE,
  ) as PageAnnotationDTO;
}

/** A page-space read in the file's coordinates. */
export function pdfAnnotationOf(
  annotation: PageAnnotationDTO,
  visible: PdfRect,
  boxOf: VisibleBoxOf,
): AnnotationDTO {
  return convertFields(annotation.subtype, annotation, { visible, boxOf }, TO_PDF) as AnnotationDTO;
}

/** A page-space create in the file's coordinates. */
export function pdfAnnotationDraftOf(
  draft: PageAnnotationDraft,
  visible: PdfRect,
  boxOf: VisibleBoxOf,
): AnnotationDraft {
  return convertFields(draft.subtype, draft, { visible, boxOf }, TO_PDF) as AnnotationDraft;
}

/** A create in the file's coordinates, in page space. */
export function pageAnnotationDraftOf(
  draft: AnnotationDraft,
  visible: PdfRect,
  boxOf: VisibleBoxOf,
): PageAnnotationDraft {
  return convertFields(draft.subtype, draft, { visible, boxOf }, TO_PAGE) as PageAnnotationDraft;
}

/**
 * A page-space update in the file's coordinates. An update may leave out its
 * `subtype`, so the kind of the annotation it changes is given.
 */
export function pdfAnnotationPatchOf(
  subtype: AnnotationSubtype,
  patch: PageAnnotationPatch,
  visible: PdfRect,
  boxOf: VisibleBoxOf,
): AnnotationPatch {
  return convertFields(subtype, patch, { visible, boxOf }, TO_PDF) as AnnotationPatch;
}

/** An update in the file's coordinates, in page space. */
export function pageAnnotationPatchOf(
  subtype: AnnotationSubtype,
  patch: AnnotationPatch,
  visible: PdfRect,
  boxOf: VisibleBoxOf,
): PageAnnotationPatch {
  return convertFields(subtype, patch, { visible, boxOf }, TO_PAGE) as PageAnnotationPatch;
}
