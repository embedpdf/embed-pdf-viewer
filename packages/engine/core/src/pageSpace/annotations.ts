import {
  mapLinkTarget,
  mapTriggerActions,
  pageDestinationOf,
  pdfDestinationOf,
  type VisibleBoxOf,
} from './destinations';
import { pageMeasureOf, pdfMeasureOf } from './measure';
import type { PdfCoordinates } from './coordinates';
import {
  ANNOTATION_FIELD_SPACES,
  ANNOTATION_FIELD_SPACES_BY_NAME,
  type MeasuredFieldSpace,
} from '../annotation/field-spaces';
import type { Annotation, AnnotationDraft, AnnotationPatch } from '../annotation/kinds';
import type { AnnotationSubtype } from '../annotation/subtype';
import type { PdfMeasurement } from '../dto/Measure';
import type { PageDestination, PdfDestination } from '../dto/PdfDestination';
import type { PdfLinkTarget } from '../dto/PdfLinkTarget';
import {
  pageBoxOf,
  pagePointOf,
  pageQuadOf,
  pdfPointOf,
  pdfQuadOf,
  pdfRectOf,
  type PageBox,
  type PagePoint,
  type PageQuad,
} from '../geometry/pageSpace';
import type { PdfPoint, PdfQuad, PdfRect } from '../geometry/primitives';
import { EngineError } from '../errors/EngineError';
import { EngineErrorCode } from '../errors/EngineErrorCode';

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
  measure: (measure: PdfMeasurement, { visible }) => pageMeasureOf(measure, visible),
  linkTarget: (target: PdfLinkTarget<PdfDestination>, { boxOf }) =>
    mapLinkTarget(target, (destination) => pageDestinationOf(destination, boxOf)),
  actions: (actions: object, { boxOf }) =>
    mapTriggerActions(actions, (destination: PdfDestination) =>
      pageDestinationOf(destination, boxOf),
    ),
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
  measure: (measure: PdfMeasurement, { visible }) => pdfMeasureOf(measure, visible),
  linkTarget: (target: PdfLinkTarget<PageDestination>, { boxOf }) =>
    mapLinkTarget(target, (destination) => pdfDestinationOf(destination, boxOf)),
  actions: (actions: object, { boxOf }) =>
    mapTriggerActions(actions, (destination: PageDestination) =>
      pdfDestinationOf(destination, boxOf),
    ),
};

/**
 * The measured fields of a kind; a kind the engine doesn't know has the base
 * fields. An update may leave out its kind: a field's name says what it
 * holds, the same in every kind.
 */
const spacesOf = (subtype: string | undefined): Readonly<Record<string, MeasuredFieldSpace>> =>
  subtype === undefined
    ? ANNOTATION_FIELD_SPACES_BY_NAME
    : (ANNOTATION_FIELD_SPACES[subtype as AnnotationSubtype] ??
      ANNOTATION_FIELD_SPACES.unsupported);

function convertFields(
  subtype: string | undefined,
  value: object,
  frame: Frame,
  converters: Record<MeasuredFieldSpace, Converter>,
): Record<string, unknown> {
  const spaces = spacesOf(subtype);
  return Object.fromEntries(
    Object.entries(value).map(([name, field]) => {
      const space = spaces[name];
      if (!space || field == null) return [name, field];
      const converted = converters[space](field as never, frame);
      if (converters === TO_PDF && hasNaN(converted)) throw notInPageSpace(name, space);
      return [name, converted];
    }),
  );
}

/** Whether a converted value has a number that isn't one: a place not given in page space. */
function hasNaN(value: unknown): boolean {
  if (typeof value === 'number') return Number.isNaN(value);
  if (typeof value !== 'object' || value === null) return false;
  return Object.values(value).some(hasNaN);
}

function notInPageSpace(name: string, space: MeasuredFieldSpace): EngineError {
  const shape = space === 'box' ? '{ x, y, width, height }' : 'points as { x, y }';
  return new EngineError(
    EngineErrorCode.InvalidArg,
    `field '${name}': expected page space, ${shape} from the page's top-left`,
    { details: { field: name } },
  );
}

/** A read in page space. `visible` is its page's visible box, in the file's coordinates. */
export function pageAnnotationOf(
  annotation: Annotation<PdfCoordinates>,
  visible: PdfRect,
  boxOf: VisibleBoxOf,
): Annotation {
  return convertFields(annotation.subtype, annotation, { visible, boxOf }, TO_PAGE) as Annotation;
}

/** A page-space read in the file's coordinates. */
export function pdfAnnotationOf(
  annotation: Annotation,
  visible: PdfRect,
  boxOf: VisibleBoxOf,
): Annotation<PdfCoordinates> {
  return convertFields(
    annotation.subtype,
    annotation,
    { visible, boxOf },
    TO_PDF,
  ) as Annotation<PdfCoordinates>;
}

/** A page-space create in the file's coordinates. */
export function pdfAnnotationDraftOf(
  draft: AnnotationDraft,
  visible: PdfRect,
  boxOf: VisibleBoxOf,
): AnnotationDraft<PdfCoordinates> {
  return convertFields(
    draft.subtype,
    draft,
    { visible, boxOf },
    TO_PDF,
  ) as AnnotationDraft<PdfCoordinates>;
}

/** A create in the file's coordinates, in page space. */
export function pageAnnotationDraftOf(
  draft: AnnotationDraft<PdfCoordinates>,
  visible: PdfRect,
  boxOf: VisibleBoxOf,
): AnnotationDraft {
  return convertFields(draft.subtype, draft, { visible, boxOf }, TO_PAGE) as AnnotationDraft;
}

/**
 * A page-space update in the file's coordinates. An update may leave out its
 * `subtype`; its fields' names say what they hold.
 */
export function pdfAnnotationPatchOf(
  patch: AnnotationPatch,
  visible: PdfRect,
  boxOf: VisibleBoxOf,
): AnnotationPatch<PdfCoordinates> {
  return convertFields(
    patch.subtype,
    patch,
    { visible, boxOf },
    TO_PDF,
  ) as AnnotationPatch<PdfCoordinates>;
}

/** An update in the file's coordinates, in page space. */
export function pageAnnotationPatchOf(
  patch: AnnotationPatch<PdfCoordinates>,
  visible: PdfRect,
  boxOf: VisibleBoxOf,
): AnnotationPatch {
  return convertFields(patch.subtype, patch, { visible, boxOf }, TO_PAGE) as AnnotationPatch;
}
