/**
 * view(model) → RenderNode[]. Pure, page-space. The committed annotations, the
 * live gesture preview, and the selection chrome (handles, knob, group box) all
 * come out here as plain data. The framework renderer just paints them.
 */
import type { Draft, Id, Model } from './model';
import type { Mat2D, Pt } from './mat2d';
import { angleOf, apply, compose, translate } from './mat2d';
import {
  HandleRole,
  KNOB_LOCAL,
  KNOB_STEM_LOCAL,
  LOCAL,
  ROLES,
  boundsOf,
  rectToTransform,
  unionBounds,
} from './geom';

export type RenderNode =
  | { kind: 'shape'; shape: 'square' | 'circle'; transform: Mat2D; color: string; ghost: boolean }
  | { kind: 'selectBox'; transform: Mat2D }
  | { kind: 'handle'; at: Pt; role: HandleRole }
  | { kind: 'rotateKnob'; at: Pt; from: Pt }
  | { kind: 'marquee'; min: Pt; max: Pt }
  | { kind: 'groupBox'; min: Pt; max: Pt }
  | { kind: 'guide'; axis: 'x' | 'y'; at: number; lo: number; hi: number }
  | { kind: 'readout'; at: Pt; text: string; snapped: boolean };

const toDegInline = (rad: number) => (rad * 180) / Math.PI;
const normDeg = (d: number) => ((d % 360) + 360) % 360;
const isSnapped = (deg: number) => Math.abs(Math.round(deg / 45) * 45 - deg) < 0.01;

function liveIds(d: Draft | null): Set<Id> {
  if (!d) return new Set();
  if (d.g === 'move') return new Set(d.ids);
  if (d.g === 'resize' || d.g === 'rotate') return new Set([d.id]);
  return new Set();
}

/** The transform an annotation should render with right now (committed, or mid-gesture). */
function effTransform(m: Model, id: Id): Mat2D {
  const a = m.byId[id];
  const d = m.draft;
  if (d) {
    if (d.g === 'move' && d.ids.includes(id))
      return compose(translate(d.delta.x, d.delta.y), a.transform);
    if ((d.g === 'resize' || d.g === 'rotate') && d.id === id) return d.cur;
  }
  return a.transform;
}

export function view(m: Model): RenderNode[] {
  const nodes: RenderNode[] = [];
  const live = liveIds(m.draft);

  // committed annotations (those mid-gesture are drawn by the preview pass instead)
  for (const id of m.order) {
    if (live.has(id)) continue;
    const a = m.byId[id];
    nodes.push({
      kind: 'shape',
      shape: a.kind,
      transform: a.transform,
      color: a.color,
      ghost: false,
    });
  }

  // live gesture preview
  const d = m.draft;
  if (d?.g === 'create') {
    nodes.push({
      kind: 'shape',
      shape: d.kind,
      transform: rectToTransform(d.from, d.to),
      color: m.color,
      ghost: true,
    });
  } else if (d?.g === 'move') {
    for (const id of d.ids) {
      const a = m.byId[id];
      nodes.push({
        kind: 'shape',
        shape: a.kind,
        transform: effTransform(m, id),
        color: a.color,
        ghost: false,
      });
    }
    for (const g of d.guides)
      nodes.push({ kind: 'guide', axis: g.axis, at: g.at, lo: g.lo, hi: g.hi });
  } else if (d?.g === 'resize' || d?.g === 'rotate') {
    const a = m.byId[d.id];
    nodes.push({ kind: 'shape', shape: a.kind, transform: d.cur, color: a.color, ghost: false });
    if (d.g === 'rotate') {
      const deg = normDeg(toDegInline(angleOf(d.cur)));
      nodes.push({
        kind: 'readout',
        at: apply(d.cur, KNOB_LOCAL),
        text: `${Math.round(deg)}°`,
        snapped: isSnapped(deg),
      });
    }
  } else if (d?.g === 'marquee') {
    nodes.push({
      kind: 'marquee',
      min: { x: Math.min(d.from.x, d.to.x), y: Math.min(d.from.y, d.to.y) },
      max: { x: Math.max(d.from.x, d.to.x), y: Math.max(d.from.y, d.to.y) },
    });
  }

  // selection chrome
  if (m.selected.length === 1) {
    const t = effTransform(m, m.selected[0]);
    nodes.push({ kind: 'selectBox', transform: t });
    for (const role of ROLES) nodes.push({ kind: 'handle', at: apply(t, LOCAL[role]), role });
    nodes.push({ kind: 'rotateKnob', at: apply(t, KNOB_LOCAL), from: apply(t, KNOB_STEM_LOCAL) });
  } else if (m.selected.length > 1) {
    const b = unionBounds(m.selected.map((id) => boundsOf(effTransform(m, id))));
    nodes.push({ kind: 'groupBox', min: b.min, max: b.max });
  }

  return nodes;
}
