import {
  assertPdfFloat,
  assertWritableMeasure,
  deriveMeasurementLabel,
  EngineError,
  EngineErrorCode,
  isReadout,
  measurementReadout,
  type AnnotationDTO,
  type AnnotationDraft,
  type AnnotationPatch,
  type PdfPoint,
} from '@embedpdf/engine-core/runtime';
import type { PdfFunctions, Ptr } from '@embedpdf/engine-runtime';

type DimensionKind = 'line' | 'polygon' | 'polyline';
type DimensionWrite = Extract<AnnotationDraft | AnnotationPatch, { subtype?: DimensionKind }>;

const inputs = ['linePoints', 'vertices', 'measure', 'intent', 'contents'] as const;

const isDimensionKind = (subtype: string | undefined): subtype is DimensionKind =>
  subtype === 'line' || subtype === 'polygon' || subtype === 'polyline';

function validate(subtype: DimensionKind, v: DimensionWrite): void {
  try {
    if (v.measure != null && v.measure.subtype === 'RL') assertWritableMeasure(v.measure);
    if (
      subtype === 'line' &&
      'leader' in v &&
      v.leader != null &&
      (typeof v.leader !== 'object' || Array.isArray(v.leader))
    )
      throw new RangeError('Invalid line leader');
    const intents =
      subtype === 'line'
        ? ['LineDimension', 'LineArrow']
        : subtype === 'polygon'
          ? ['PolygonDimension', 'PolygonCloud']
          : ['PolyLineDimension'];
    if (v.intent != null && !intents.includes(v.intent))
      throw new RangeError('Invalid measurement intent');
    if (v.captionEnabled != null && typeof v.captionEnabled !== 'boolean')
      throw new RangeError('Invalid caption visibility');
    if ('captionPosition' in v && v.captionPosition != null) {
      if (!['inline', 'top'].includes(v.captionPosition))
        throw new RangeError('Invalid caption position');
    }
    if ('captionOffset' in v && v.captionOffset) {
      assertPdfFloat(v.captionOffset.along);
      assertPdfFloat(v.captionOffset.perpendicular);
    }
    if ('captionCenter' in v && v.captionCenter) {
      assertPdfFloat(v.captionCenter.x);
      assertPdfFloat(v.captionCenter.y);
    }
    if ('leader' in v && v.leader) {
      for (const n of [v.leader.length, v.leader.extension ?? 0, v.leader.offset ?? 0])
        assertPdfFloat(n);
      if ((v.leader.extension ?? 0) < 0 || (v.leader.offset ?? 0) < 0)
        throw new RangeError('Leader extension and offset must be nonnegative');
    }
    const points =
      'linePoints' in v
        ? v.linePoints
          ? [v.linePoints.start, v.linePoints.end]
          : []
        : 'vertices' in v
          ? (v.vertices ?? [])
          : [];
    for (const p of points) {
      assertPdfFloat(p.x);
      assertPdfFloat(p.y);
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
  const a = before[0],
    b = after[0];
  const index = before.findIndex((p) => Math.hypot(p.x - a.x, p.y - a.y) > 1e-6);
  if (index < 0) return undefined;
  const u = { x: before[index].x - a.x, y: before[index].y - a.y };
  const v = { x: after[index].x - b.x, y: after[index].y - b.y };
  const length = u.x * u.x + u.y * u.y;
  const cos = (u.x * v.x + u.y * v.y) / length,
    sin = (u.x * v.y - u.y * v.x) / length;
  if (Math.abs(cos * cos + sin * sin - 1) > 1e-5) return undefined;
  const transform = (p: PdfPoint): PdfPoint => ({
    x: b.x + cos * (p.x - a.x) - sin * (p.y - a.y),
    y: b.y + sin * (p.x - a.x) + cos * (p.y - a.y),
  });
  if (
    !before.every((p, i) => {
      const t = transform(p);
      return Math.hypot(t.x - after[i].x, t.y - after[i].y) <= 1e-3;
    })
  )
    return undefined;
  return transform(center);
}

const CAPTION_FIELDS = ['captionEnabled', 'captionPosition', 'captionOffset', 'captionCenter'];

const touchesCaption = (value: object): boolean =>
  CAPTION_FIELDS.some((name) => (value as Record<string, unknown>)[name] !== undefined);

/**
 * Prepare a dimension draft for the writer: validate it, derive its label,
 * and complete its caption fields, since the native caption setters write the
 * whole caption at once.
 */
export function prepareMeasurementDraft(draft: AnnotationDraft): AnnotationDraft {
  if (!isDimensionKind(draft.subtype)) return draft;
  const dimension = draft as DimensionWrite;
  validate(draft.subtype, dimension);
  if (dimension.measure != null && dimension.measure.subtype !== 'RL') {
    throw new EngineError(
      EngineErrorCode.InvalidArg,
      `A ${dimension.measure.subtype === 'GEO' ? 'geospatial' : 'foreign'} measure can't be written; leave measure out`,
    );
  }
  let prepared = draft;
  if (touchesCaption(draft)) {
    if (draft.subtype === 'line') {
      prepared = {
        ...draft,
        captionEnabled: draft.captionEnabled ?? false,
        captionPosition: draft.captionPosition ?? 'inline',
        captionOffset: draft.captionOffset ?? null,
      };
    } else if (draft.subtype === 'polygon' || draft.subtype === 'polyline') {
      prepared = {
        ...draft,
        captionEnabled: draft.captionEnabled ?? (draft.captionCenter != null ? false : null),
        captionCenter: draft.captionCenter ?? null,
      };
    }
  }
  return deriveMeasurementLabel(prepared as never) as AnnotationDraft;
}

/**
 * Prepare a dimension patch for the writer. The patch's subtype is the
 * target's. Caption fields merge with the current caption into a complete
 * caption; a whole-shape move carries a manual caption center along; a
 * foreign measure marker sent back keeps the measure as it is; and the label
 * is derived from the resulting geometry and scale.
 */
export function prepareMeasurementPatch(
  fn: PdfFunctions,
  annot: Ptr,
  current: AnnotationDTO,
  patch: AnnotationPatch,
): AnnotationPatch {
  if (patch.subtype !== undefined && patch.subtype !== current.subtype)
    throw new EngineError(EngineErrorCode.InvalidArg, 'Annotation subtype cannot change');
  if (!isDimensionKind(current.subtype)) return patch;
  if (current.subtype !== 'line' && current.subtype !== 'polygon' && current.subtype !== 'polyline')
    return patch;
  const subtype = current.subtype;
  let next = { ...patch, subtype } as DimensionWrite & { subtype: DimensionKind };
  validate(subtype, next);

  if (next.measure != null && next.measure.subtype !== 'RL') {
    if (current.measure?.subtype !== next.measure.subtype) {
      throw new EngineError(
        EngineErrorCode.InvalidArg,
        `A ${next.measure.subtype === 'GEO' ? 'geospatial' : 'foreign'} measure can't be written; leave measure out`,
      );
    }
    // The marker a read returned, sent back: the measure stays as it is.
    next = { ...next, measure: undefined };
  }

  if (current.subtype === 'line' && next.subtype === 'line') {
    if (touchesCaption(next)) {
      next = {
        ...next,
        captionEnabled: next.captionEnabled ?? current.captionEnabled,
        captionPosition: next.captionPosition ?? current.captionPosition,
        captionOffset:
          next.captionOffset === undefined ? current.captionOffset : next.captionOffset,
      };
    }
  } else if (current.subtype !== 'line' && next.subtype !== 'line') {
    if (
      touchesCaption(next) &&
      fn.FPDFAnnot_HasKey(annot, 'EMBD_Metadata') &&
      fn.FPDFAnnot_GetValueType(annot, 'EMBD_Metadata') !== 6
    ) {
      throw new EngineError(
        EngineErrorCode.InvalidArg,
        'Malformed annotation metadata cannot store a caption',
      );
    }
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

  if (inputs.some((key) => (next as Record<string, unknown>)[key] !== undefined)) {
    const readout = measurementReadout({ ...current, ...next } as never);
    if (isReadout(readout)) next = { ...next, contents: readout.label };
  }
  validate(subtype, next);
  return next as AnnotationPatch;
}
