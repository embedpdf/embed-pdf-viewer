import { EngineError } from '../../errors/EngineError';
import { EngineErrorCode } from '../../errors/EngineErrorCode';
import type { PdfPoint } from '../../geometry/primitives';
import { deriveMeasurementLabel, isReadout, measurementReadout } from '../../measure/derive';
import { assertPdfFloat, assertWritableMeasure } from '../../measure/validate';
import type { PdfCoordinates } from '../../pageSpace/coordinates';
import type { AnnotationDraft, Annotation, AnnotationPatch } from '../kinds';

type DimensionKind = 'line' | 'polygon' | 'polyline';
type DimensionWrite = Extract<
  AnnotationDraft<PdfCoordinates> | AnnotationPatch<PdfCoordinates>,
  { subtype?: DimensionKind }
>;

/** The fields a measurement's label is worked out from. */
const LABEL_INPUTS = ['linePoints', 'vertices', 'measure', 'intent', 'contents'] as const;

const CAPTION_FIELDS = ['captionEnabled', 'captionPosition', 'captionOffset', 'captionCenter'];

const isDimensionKind = (subtype: string | undefined): subtype is DimensionKind =>
  subtype === 'line' || subtype === 'polygon' || subtype === 'polyline';

/** Whether a write names any of the caption's fields. */
export const touchesCaption = (value: object): boolean =>
  CAPTION_FIELDS.some((name) => (value as Record<string, unknown>)[name] !== undefined);

function validate(subtype: DimensionKind, write: DimensionWrite): void {
  try {
    if (write.measure != null && write.measure.subtype === 'rectilinear')
      assertWritableMeasure(write.measure);
    if (
      subtype === 'line' &&
      'leader' in write &&
      write.leader != null &&
      (typeof write.leader !== 'object' || Array.isArray(write.leader))
    )
      throw new EngineError(EngineErrorCode.InvalidArg, 'Invalid line leader');
    const intents =
      subtype === 'line'
        ? ['line-dimension', 'line-arrow']
        : subtype === 'polygon'
          ? ['polygon-dimension', 'polygon-cloud']
          : ['polyline-dimension'];
    if (write.intent != null && !intents.includes(write.intent))
      throw new EngineError(EngineErrorCode.InvalidArg, 'Invalid measurement intent');
    if (write.captionEnabled != null && typeof write.captionEnabled !== 'boolean')
      throw new EngineError(EngineErrorCode.InvalidArg, 'Invalid caption visibility');
    if ('captionPosition' in write && write.captionPosition != null) {
      if (!['inline', 'top'].includes(write.captionPosition))
        throw new EngineError(EngineErrorCode.InvalidArg, 'Invalid caption position');
    }
    if ('captionOffset' in write && write.captionOffset) {
      assertPdfFloat(write.captionOffset.along);
      assertPdfFloat(write.captionOffset.perpendicular);
    }
    if ('captionCenter' in write && write.captionCenter) {
      assertPdfFloat(write.captionCenter.x);
      assertPdfFloat(write.captionCenter.y);
    }
    if ('leader' in write && write.leader) {
      for (const length of [
        write.leader.length,
        write.leader.extension ?? 0,
        write.leader.offset ?? 0,
      ])
        assertPdfFloat(length);
      if ((write.leader.extension ?? 0) < 0 || (write.leader.offset ?? 0) < 0)
        throw new EngineError(
          EngineErrorCode.InvalidArg,
          'Leader extension and offset must be nonnegative',
        );
    }
    const points =
      'linePoints' in write
        ? write.linePoints
          ? [write.linePoints.start, write.linePoints.end]
          : []
        : 'vertices' in write
          ? (write.vertices ?? [])
          : [];
    for (const point of points) {
      assertPdfFloat(point.x);
      assertPdfFloat(point.y);
    }
  } catch (error) {
    throw new EngineError(EngineErrorCode.InvalidArg, (error as Error).message);
  }
}

/** Infer a rigid transform only when all corresponding vertices agree. Vertex edits leave a manual center fixed. */
function moveCenter(
  before: readonly PdfPoint[],
  after: readonly PdfPoint[],
  center: PdfPoint,
): PdfPoint | undefined {
  if (before.length !== after.length || before.length < 2) return undefined;
  const origin = before[0]!;
  const moved = after[0]!;
  const index = before.findIndex(
    (point) => Math.hypot(point.x - origin.x, point.y - origin.y) > 1e-6,
  );
  if (index < 0) return undefined;
  const from = { x: before[index]!.x - origin.x, y: before[index]!.y - origin.y };
  const to = { x: after[index]!.x - moved.x, y: after[index]!.y - moved.y };
  const length = from.x * from.x + from.y * from.y;
  const cos = (from.x * to.x + from.y * to.y) / length;
  const sin = (from.x * to.y - from.y * to.x) / length;
  if (Math.abs(cos * cos + sin * sin - 1) > 1e-5) return undefined;
  const transform = (point: PdfPoint): PdfPoint => ({
    x: moved.x + cos * (point.x - origin.x) - sin * (point.y - origin.y),
    y: moved.y + sin * (point.x - origin.x) + cos * (point.y - origin.y),
  });
  if (
    !before.every((point, i) => {
      const placed = transform(point);
      return Math.hypot(placed.x - after[i]!.x, placed.y - after[i]!.y) <= 1e-3;
    })
  )
    return undefined;
  return transform(center);
}

/**
 * A dimension draft ready for the writer: validated, its label worked out,
 * and its caption fields complete, since the native caption setters write
 * the whole caption at once.
 */
export function resolveMeasurementDraft(
  draft: AnnotationDraft<PdfCoordinates>,
): AnnotationDraft<PdfCoordinates> {
  if (!isDimensionKind(draft.subtype)) return draft;
  const dimension = draft as DimensionWrite;
  validate(draft.subtype, dimension);
  if (dimension.measure != null && dimension.measure.subtype !== 'rectilinear') {
    throw new EngineError(
      EngineErrorCode.InvalidArg,
      `A ${dimension.measure.subtype === 'geospatial' ? 'geospatial' : 'foreign'} measure can't be written; leave measure out`,
    );
  }
  let resolved = draft;
  if (touchesCaption(draft)) {
    if (draft.subtype === 'line') {
      resolved = {
        ...draft,
        // `null` is a line without a caption flag, as a read says.
        captionEnabled: draft.captionEnabled === undefined ? false : draft.captionEnabled,
        captionPosition: draft.captionPosition ?? 'inline',
        captionOffset: draft.captionOffset ?? null,
      };
    } else if (draft.subtype === 'polygon' || draft.subtype === 'polyline') {
      resolved = {
        ...draft,
        captionEnabled: draft.captionEnabled ?? (draft.captionCenter != null ? false : null),
        captionCenter: draft.captionCenter ?? null,
      };
    }
  }
  return deriveMeasurementLabel(resolved as never) as AnnotationDraft<PdfCoordinates>;
}

/**
 * A dimension patch with what follows from it. The patch's subtype is the
 * target's. Caption fields merge with the current caption into a complete
 * caption; a whole-shape move carries a manual caption center along; a
 * foreign measure marker sent back keeps the measure as it is; and the label
 * is worked out from the resulting geometry and scale.
 */
export function measurementFollows(
  current: Annotation<PdfCoordinates>,
  patch: AnnotationPatch<PdfCoordinates>,
): AnnotationPatch<PdfCoordinates> {
  if (current.subtype !== 'line' && current.subtype !== 'polygon' && current.subtype !== 'polyline')
    return patch;
  const subtype = current.subtype;
  let next = { ...patch, subtype } as DimensionWrite & { subtype: DimensionKind };
  validate(subtype, next);

  if (next.measure != null && next.measure.subtype !== 'rectilinear') {
    if (current.measure?.subtype !== next.measure.subtype) {
      throw new EngineError(
        EngineErrorCode.InvalidArg,
        `A ${next.measure.subtype === 'geospatial' ? 'geospatial' : 'foreign'} measure can't be written; leave measure out`,
      );
    }
    // The marker a read returned, sent back: the measure stays as it is.
    next = { ...next, measure: undefined };
  }

  if (current.subtype === 'line' && next.subtype === 'line') {
    if (touchesCaption(next)) {
      next = {
        ...next,
        captionEnabled:
          next.captionEnabled === undefined ? current.captionEnabled : next.captionEnabled,
        captionPosition: next.captionPosition ?? current.captionPosition,
        captionOffset:
          next.captionOffset === undefined ? current.captionOffset : next.captionOffset,
      };
    }
  } else if (current.subtype !== 'line' && next.subtype !== 'line') {
    if (
      next.vertices &&
      next.captionEnabled !== null &&
      next.captionCenter === undefined &&
      current.captionCenter
    ) {
      const center = moveCenter(current.vertices, next.vertices, current.captionCenter);
      if (center) next = { ...next, captionCenter: center };
    }
    if (touchesCaption(next)) {
      next =
        next.captionEnabled === null
          ? // No caption flag: the caption and its placement go together.
            { ...next, captionEnabled: null, captionCenter: null }
          : {
              ...next,
              captionEnabled: next.captionEnabled ?? current.captionEnabled ?? false,
              captionCenter:
                next.captionCenter === undefined ? current.captionCenter : next.captionCenter,
            };
    }
  }

  if (LABEL_INPUTS.some((key) => (next as Record<string, unknown>)[key] !== undefined)) {
    const readout = measurementReadout({ ...current, ...next } as never);
    if (isReadout(readout)) next = { ...next, contents: readout.label };
  }
  validate(subtype, next);
  return next as AnnotationPatch<PdfCoordinates>;
}
