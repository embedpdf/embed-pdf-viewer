import {
  assertPdfFloat,
  assertWritableMeasure,
  deriveMeasurementLabel,
  EngineError,
  EngineErrorCode,
  isReadout,
  measurementReadout,
  type AnnotationDTO,
  type WireAnnotationDraft,
  type WireAnnotationPatch,
  type PdfPoint,
} from '@embedpdf/engine-core/runtime';
import type { PdfFunctions, Ptr } from '@embedpdf/engine-runtime';

const kinds = new Set(['line', 'polygon', 'polyline']);
const inputs = ['linePoints', 'vertices', 'measure', 'intent', 'contents'] as const;

function validate(value: WireAnnotationDraft | WireAnnotationPatch): void {
  if (!kinds.has(value.subtype)) return;
  const v = value as Extract<WireAnnotationPatch, { subtype: 'line' | 'polygon' | 'polyline' }>;
  try {
    if (v.measure !== undefined && v.measure !== null) assertWritableMeasure(v.measure);
    if (v.caption != null && (typeof v.caption !== 'object' || Array.isArray(v.caption)))
      throw new RangeError('Invalid caption');
    if (
      v.subtype === 'line' &&
      v.leader != null &&
      (typeof v.leader !== 'object' || Array.isArray(v.leader))
    )
      throw new RangeError('Invalid line leader');
    const intents =
      v.subtype === 'line'
        ? ['LineDimension', 'LineArrow']
        : v.subtype === 'polygon'
          ? ['PolygonDimension', 'PolygonCloud']
          : ['PolyLineDimension'];
    if (v.intent != null && !intents.includes(v.intent))
      throw new RangeError('Invalid measurement intent');
    if (v.caption) {
      if (v.caption.enabled !== undefined && typeof v.caption.enabled !== 'boolean')
        throw new RangeError('Invalid caption visibility');
      if (v.subtype === 'line') {
        if (v.caption.position != null && !['inline', 'top'].includes(v.caption.position))
          throw new RangeError('Invalid caption position');
        if (v.caption.offset) {
          assertPdfFloat(v.caption.offset.along);
          assertPdfFloat(v.caption.offset.perpendicular);
        }
      } else if (v.caption.center) {
        assertPdfFloat(v.caption.center.x);
        assertPdfFloat(v.caption.center.y);
      }
    }
    if (v.subtype === 'line' && v.leader) {
      for (const n of [v.leader.length, v.leader.extension ?? 0, v.leader.offset ?? 0])
        assertPdfFloat(n);
      if ((v.leader.extension ?? 0) < 0 || (v.leader.offset ?? 0) < 0)
        throw new RangeError('Leader extension and offset must be nonnegative');
    }
    const points =
      v.subtype === 'line'
        ? v.linePoints
          ? [v.linePoints.start, v.linePoints.end]
          : []
        : (v.vertices ?? []);
    for (const p of points) {
      assertPdfFloat(p.x);
      assertPdfFloat(p.y);
    }
  } catch (error) {
    throw new EngineError(EngineErrorCode.InvalidArg, (error as Error).message);
  }
}

/** Infer a rigid transform only when ALL corresponding vertices agree. Vertex edits leave a manual center fixed. */
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

export function prepareMeasurementDraft(draft: WireAnnotationDraft): WireAnnotationDraft {
  validate(draft);
  if (
    (draft.subtype === 'line' || draft.subtype === 'polygon' || draft.subtype === 'polyline') &&
    draft.caption &&
    draft.caption.enabled === undefined
  ) {
    throw new EngineError(EngineErrorCode.InvalidArg, 'A new caption requires enabled');
  }
  return deriveMeasurementLabel(draft);
}

export function prepareMeasurementPatch(
  fn: PdfFunctions,
  annot: Ptr,
  current: AnnotationDTO,
  patch: WireAnnotationPatch,
): WireAnnotationPatch {
  if (patch.subtype !== current.subtype)
    throw new EngineError(EngineErrorCode.InvalidArg, 'Annotation subtype cannot change');
  validate(patch);
  if (
    (patch.subtype !== 'line' && patch.subtype !== 'polygon' && patch.subtype !== 'polyline') ||
    (current.subtype !== 'line' && current.subtype !== 'polygon' && current.subtype !== 'polyline')
  )
    return patch;
  if (patch.measure && current.measure && current.measure.subtype !== 'RL') {
    throw new EngineError(
      EngineErrorCode.InvalidArg,
      'Remove the foreign measure explicitly before replacing it',
    );
  }
  if (
    patch.subtype !== 'line' &&
    patch.caption &&
    fn.FPDFAnnot_HasKey(annot, 'EMBD_Metadata') &&
    fn.FPDFAnnot_GetValueType(annot, 'EMBD_Metadata') !== 6
  ) {
    throw new EngineError(
      EngineErrorCode.InvalidArg,
      'Malformed annotation metadata cannot store a caption',
    );
  }
  if (
    patch.subtype !== 'line' &&
    current.subtype !== 'line' &&
    patch.vertices &&
    patch.caption !== null &&
    patch.caption?.center === undefined &&
    current.caption?.center
  ) {
    const center = moveCenter(current.vertices, patch.vertices, current.caption.center);
    if (center) patch = { ...patch, caption: { ...current.caption, ...patch.caption, center } };
  }
  if (patch.caption) {
    if (patch.subtype === 'line' && current.subtype === 'line') {
      const c = { enabled: false, ...current.caption, ...patch.caption };
      patch = {
        ...patch,
        caption: {
          enabled: c.enabled,
          position: c.position ?? 'inline',
          ...(c.offset ? { offset: c.offset } : {}),
        },
      };
    } else if (patch.subtype !== 'line' && current.subtype !== 'line') {
      const c = { enabled: false, ...current.caption, ...patch.caption };
      patch = {
        ...patch,
        caption: { enabled: c.enabled, ...(c.center ? { center: c.center } : {}) },
      };
    }
  }
  if (inputs.some((key) => (patch as unknown as Record<string, unknown>)[key] !== undefined)) {
    const readout = measurementReadout({ ...current, ...patch });
    if (isReadout(readout)) patch = { ...patch, contents: readout.label };
  }
  validate(patch);
  return patch;
}
