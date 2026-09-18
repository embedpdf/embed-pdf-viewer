import { isReadout, measurementReadout } from '@embedpdf/engine-core/runtime';
import type {
  LineDimensionCaption,
  LineLeader,
  PdfMeasurement,
  PdfRect,
} from '@embedpdf/engine-core/runtime';
import { geomScene } from './geometry';
import type { Geom, Paint, SceneNode, Style, Vec } from './types';

/** A distance annotation's render projection. Offsets stay in PDF line axes;
 * crop is retained so numeric rounding happens in the original PDF frame. */
export interface DistanceAppearance {
  intent: 'LineDimension';
  measure: PdfMeasurement | null;
  caption: LineDimensionCaption;
  leader?: LineLeader;
  crop: PdfRect;
  text: string;
}

export function distanceLabel(geom: Geom, appearance: DistanceAppearance): string {
  if (geom.t !== 'line') return appearance.text;
  const pdf = (p: Vec) => ({ x: p.x + appearance.crop.left, y: appearance.crop.top - p.y });
  const readout = measurementReadout({
    subtype: 'line',
    intent: appearance.intent,
    measure: appearance.measure,
    linePoints: { start: pdf(geom.a), end: pdf(geom.b) },
  });
  return isReadout(readout) ? readout.label : appearance.text;
}

const add = (a: Vec, b: Vec, scale = 1): Vec => ({ x: a.x + b.x * scale, y: a.y + b.y * scale });

/** The native dimension layout in content coordinates. Text advance is a
 * Helvetica approximation for live gestures; the committed AP is authoritative. */
export function distanceLayout(geom: Geom, m: DistanceAppearance, width: number) {
  if (geom.t !== 'line') return null;
  const length = Math.hypot(geom.b.x - geom.a.x, geom.b.y - geom.a.y);
  const along = length
    ? { x: (geom.b.x - geom.a.x) / length, y: (geom.b.y - geom.a.y) / length }
    : { x: 1, y: 0 };
  const normal = { x: along.y, y: -along.x };
  const ll = m.leader?.length ?? 0;
  const start = add(geom.a, normal, ll),
    end = add(geom.b, normal, ll);
  const text = distanceLabel(geom, m),
    height = 9,
    textWidth = text.length * height * 0.52;
  const outside = textWidth + 4 + 12 * width > length;
  const u = along.x < 0 || (along.x === 0 && along.y > 0) ? { x: -along.x, y: -along.y } : along;
  const up = { x: u.y, y: -u.x };
  let center = { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 };
  center = add(
    add(center, along, m.caption.offset?.along ?? 0),
    normal,
    m.caption.offset?.perpendicular ?? 0,
  );
  if (m.caption.position === 'top' || outside)
    center = add(center, up, (outside && ll < 0 ? -1 : 1) * (height / 2 + 2));
  const perp = (center.x - start.x) * normal.x + (center.y - start.y) * normal.y;
  const at = (center.x - start.x) * along.x + (center.y - start.y) * along.y;
  const gap =
    m.caption.enabled &&
    text &&
    !outside &&
    m.caption.position !== 'top' &&
    Math.abs(perp) < height / 2 + 2
      ? [
          Math.max(0, Math.min(length, at - textWidth / 2 - 2)),
          Math.max(0, Math.min(length, at + textWidth / 2 + 2)),
        ]
      : null;
  return {
    along,
    normal,
    start,
    end,
    center,
    u,
    up,
    text,
    textWidth,
    height,
    length,
    outside,
    gap,
  };
}

export function distanceCaptionAt(geom: Geom, m: DistanceAppearance, width: number): Vec | null {
  return m.caption.enabled ? (distanceLayout(geom, m, width)?.center ?? null) : null;
}

export function moveDistanceCaption(
  geom: Geom,
  m: DistanceAppearance,
  delta: Vec,
): DistanceAppearance {
  const layout = distanceLayout(geom, m, 1);
  if (!layout) return m;
  return {
    ...m,
    caption: {
      ...m.caption,
      offset: {
        along: (m.caption.offset?.along ?? 0) + delta.x * layout.along.x + delta.y * layout.along.y,
        perpendicular:
          (m.caption.offset?.perpendicular ?? 0) +
          delta.x * layout.normal.x +
          delta.y * layout.normal.y,
      },
    },
  };
}

export function distanceScene(geom: Geom, m: DistanceAppearance, style: Style): SceneNode[] {
  const l = distanceLayout(geom, m, style.strokeWidth);
  if (!l || geom.t !== 'line') return [];
  const paint: Paint = {
    stroke: style.color,
    width: style.strokeWidth,
    opacity: style.opacity,
    dash: style.border.kind === 'dashed' ? style.border.dash : undefined,
  };
  const nodes: SceneNode[] = [];
  const segment = (a: Vec, b: Vec) => nodes.push({ kind: 'line', a, b, paint });
  if (l.gap) {
    if (l.gap[0] > 0) segment(l.start, add(l.start, l.along, l.gap[0]));
    if (l.gap[1] < l.length) segment(add(l.start, l.along, l.gap[1]), l.end);
  } else segment(l.start, l.end);
  const ll = m.leader?.length ?? 0;
  if (ll)
    for (const p of [geom.a, geom.b])
      segment(
        add(p, l.normal, Math.sign(ll) * (m.leader?.offset ?? 0)),
        add(p, l.normal, ll + Math.sign(ll) * (m.leader?.extension ?? 0)),
      );
  // geomScene's first node is the shaft; the remaining nodes are the endings.
  const arrowGeom: Geom = { ...geom, a: l.start, b: l.end };
  if (l.outside && m.caption.enabled) {
    segment(add(l.start, l.along, -8 * style.strokeWidth), l.start);
    segment(l.end, add(l.end, l.along, 8 * style.strokeWidth));
    arrowGeom.a = l.end;
    arrowGeom.b = l.start;
    arrowGeom.ends = { start: geom.ends?.end ?? 'none', end: geom.ends?.start ?? 'none' };
  }
  for (const node of geomScene(arrowGeom, style.strokeWidth).slice(1))
    nodes.push({
      ...node,
      paint: {
        ...paint,
        fill:
          node.kind === 'poly' && node.closed ? (style.interiorColor ?? style.color) : undefined,
      },
    } as SceneNode);
  if (m.caption.enabled && l.text) {
    const at = add(add(l.center, l.u, -l.textWidth / 2), l.up, -l.height * 0.35);
    nodes.push({
      kind: 'text',
      at,
      text: l.text,
      fontSize: l.height,
      fontFamily: 'Helvetica, Arial, sans-serif',
      rotation: (Math.atan2(l.u.y, l.u.x) * 180) / Math.PI,
      paint: { fill: '#000000', opacity: style.opacity },
    });
  }
  return nodes;
}
