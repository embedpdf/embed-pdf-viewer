/**
 * The pure core: update(model, msg) → [model, effects].
 *
 * The default `select` tool branches on what's under the pointer at `down`
 * (handle → resize, knob → rotate, body → move, empty → marquee). Create tools
 * fold a drag into a draft. Move/resize/rotate are all a single idea: build a
 * Mat2D and apply it to the placement. Nothing here touches the DOM or the engine.
 */
import { Annotation, Effect, HitEnv, Model, Msg, PointerSample } from './model';
import { Pt, angleOf, apply, compose, invert, rotateAbout, scaleAbout, translate } from './mat2d';
import { hitTest } from './hit';
import { boundsOf, center, intersects, rectOf, rectToTransform, unionBounds } from './geom';
import { computeMoveSnap } from './snap';

const MIN_DRAG = 3; // page units; ignore micro-drags so a click ≠ a tiny rectangle
const SNAP_PX = 8; // alignment-guide tolerance, in screen px
const ROT_STEP = 45; // rotation snaps to multiples of this…
const ROT_TOL = 5; // …when within this many degrees (so 85° shows raw, 86° → 90°)

const toDeg = (rad: number) => (rad * 180) / Math.PI;
const toRad = (deg: number) => (deg * Math.PI) / 180;
function snapDeg(deg: number): number {
  const nearest = Math.round(deg / ROT_STEP) * ROT_STEP;
  return Math.abs(deg - nearest) < ROT_TOL ? nearest : deg;
}

export function update(m: Model, msg: Msg): [Model, Effect[]] {
  switch (msg.t) {
    case 'setTool':
      return [{ ...m, tool: msg.tool, draft: null }, []];
    case 'setColor':
      return setColor(m, msg.color);
    case 'rotate90':
      return rotateSelection(m, Math.PI / 2);
    case 'delete':
      return deleteSelection(m);
    case 'cancel':
      return [{ ...m, draft: null }, []];
    case 'pointer':
      return reducePointer(m, msg.s, msg.env);
  }
}

function setColor(m: Model, color: string): [Model, Effect[]] {
  if (!m.selected.length) return [{ ...m, color }, []];
  const byId = { ...m.byId };
  for (const id of m.selected) byId[id] = { ...byId[id], color };
  return [{ ...m, color, byId }, []];
}

function reducePointer(m: Model, s: PointerSample, env: HitEnv): [Model, Effect[]] {
  if (s.phase === 'down') return onDown(m, s, env);
  if (s.phase === 'move') return m.draft ? onMove(m, s, env) : [m, []];
  return m.draft ? onUp(m, s) : [m, []];
}

function onDown(m: Model, s: PointerSample, env: HitEnv): [Model, Effect[]] {
  if (m.tool === 'square' || m.tool === 'circle') {
    return [
      { ...m, selected: [], draft: { g: 'create', kind: m.tool, from: s.page, to: s.page } },
      [],
    ];
  }

  // default `select` tool — dispatch on the target under the pointer
  const hit = hitTest(m, s, env);
  switch (hit.t) {
    case 'handle': {
      const base = m.byId[hit.id].transform;
      return [
        {
          ...m,
          draft: {
            g: 'resize',
            id: hit.id,
            anchorLocal: hit.anchorLocal,
            cornerLocal: hit.cornerLocal,
            base,
            cur: base,
          },
        },
        [],
      ];
    }
    case 'rotate': {
      const base = m.byId[hit.id].transform;
      const pivot = apply(base, { x: 0, y: 0 });
      const start = Math.atan2(s.page.y - pivot.y, s.page.x - pivot.x);
      return [{ ...m, draft: { g: 'rotate', id: hit.id, pivot, start, base, cur: base } }, []];
    }
    case 'shape': {
      const inSel = m.selected.includes(hit.id);
      const selected = s.shift
        ? inSel
          ? m.selected.filter((x) => x !== hit.id)
          : [...m.selected, hit.id]
        : inSel
          ? m.selected // keep the whole group so you can drag it
          : [hit.id];
      return [
        {
          ...m,
          selected,
          draft: { g: 'move', ids: selected, start: s.page, delta: { x: 0, y: 0 }, guides: [] },
        },
        [],
      ];
    }
    case 'empty':
      return [{ ...m, selected: [], draft: { g: 'marquee', from: s.page, to: s.page } }, []];
  }
}

function onMove(m: Model, s: PointerSample, env: HitEnv): [Model, Effect[]] {
  const d = m.draft!;
  switch (d.g) {
    case 'create':
      return [{ ...m, draft: { ...d, to: s.page } }, []];
    case 'move': {
      const raw = { x: s.page.x - d.start.x, y: s.page.y - d.start.y };
      const scale = env.toView[0] || 1;
      const page = { min: { x: 0, y: 0 }, max: { x: env.page.width, y: env.page.height } };
      const snap = computeMoveSnap(m, d.ids, raw, SNAP_PX / scale, page);
      return [{ ...m, draft: { ...d, delta: snap.delta, guides: snap.guides } }, []];
    }
    case 'resize': {
      const lp = apply(invert(d.base), s.page); // where the dragged corner should land, in local space
      const sx = (lp.x - d.anchorLocal.x) / (d.cornerLocal.x - d.anchorLocal.x);
      const sy = (lp.y - d.anchorLocal.y) / (d.cornerLocal.y - d.anchorLocal.y);
      const cur = compose(d.base, scaleAbout(d.anchorLocal, sx || 1e-4, sy || 1e-4));
      return [{ ...m, draft: { ...d, cur } }, []];
    }
    case 'rotate': {
      const ang = Math.atan2(s.page.y - d.pivot.y, s.page.x - d.pivot.x);
      const baseAngle = angleOf(d.base);
      const rawTotal = toDeg(baseAngle + (ang - d.start));
      const finalDelta = toRad(snapDeg(rawTotal)) - baseAngle; // snap the ABSOLUTE angle, not the delta
      const cur = compose(rotateAbout(d.pivot, finalDelta), d.base);
      return [{ ...m, draft: { ...d, cur } }, []];
    }
    case 'marquee':
      return [{ ...m, draft: { ...d, to: s.page } }, []];
  }
}

function onUp(m: Model, s: PointerSample): [Model, Effect[]] {
  const d = m.draft!;
  switch (d.g) {
    case 'create': {
      if (Math.abs(d.to.x - d.from.x) < MIN_DRAG && Math.abs(d.to.y - d.from.y) < MIN_DRAG) {
        return [{ ...m, draft: null }, []];
      }
      const id = `a${m.seq + 1}`;
      const annotation: Annotation = {
        id,
        kind: d.kind,
        color: m.color,
        transform: rectToTransform(d.from, d.to),
      };
      return [
        {
          ...m,
          seq: m.seq + 1,
          byId: { ...m.byId, [id]: annotation },
          order: [...m.order, id],
          selected: [id],
          tool: 'select',
          draft: null,
        },
        [{ fx: 'persistCreate', annotation }],
      ];
    }
    case 'move': {
      if (Math.hypot(d.delta.x, d.delta.y) < 0.01) return [{ ...m, draft: null }, []]; // a click, not a drag
      const byId = { ...m.byId };
      const fx: Effect[] = [];
      for (const id of d.ids) {
        const transform = compose(translate(d.delta.x, d.delta.y), m.byId[id].transform);
        byId[id] = { ...byId[id], transform };
        fx.push({ fx: 'persistPatch', id, transform });
      }
      return [{ ...m, byId, draft: null }, fx];
    }
    case 'resize':
    case 'rotate': {
      const transform = d.cur;
      return [
        { ...m, byId: { ...m.byId, [d.id]: { ...m.byId[d.id], transform } }, draft: null },
        [{ fx: 'persistPatch', id: d.id, transform }],
      ];
    }
    case 'marquee': {
      const box = rectOf(d.from, d.to);
      const selected = m.order.filter((id) => intersects(boundsOf(m.byId[id].transform), box));
      return [{ ...m, selected, draft: null }, []];
    }
  }
}

function selectionCenter(m: Model): Pt {
  return center(unionBounds(m.selected.map((id) => boundsOf(m.byId[id].transform))));
}

/** Group rotate: one matrix about the selection's center, applied to every member. */
function rotateSelection(m: Model, rad: number): [Model, Effect[]] {
  if (!m.selected.length) return [m, []];
  const R = rotateAbout(selectionCenter(m), rad);
  const byId = { ...m.byId };
  const fx: Effect[] = [];
  for (const id of m.selected) {
    const transform = compose(R, m.byId[id].transform);
    byId[id] = { ...byId[id], transform };
    fx.push({ fx: 'persistPatch', id, transform });
  }
  return [{ ...m, byId, draft: null }, fx];
}

function deleteSelection(m: Model): [Model, Effect[]] {
  if (!m.selected.length) return [m, []];
  const sel = new Set(m.selected);
  const byId = { ...m.byId };
  for (const id of m.selected) delete byId[id];
  const fx: Effect[] = m.selected.map((id) => ({ fx: 'persistDelete', id }) as Effect);
  return [
    { ...m, byId, order: m.order.filter((id) => !sel.has(id)), selected: [], draft: null },
    fx,
  ];
}
