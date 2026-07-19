/**
 * Pure-core tests — no DOM, no React. This is the whole point of the
 * architecture: the interaction brain is testable as plain functions.
 * Run with `pnpm --filter @embedpdf/example-annotation-spike test`.
 */
import { describe, expect, it } from 'vitest';
import { Draft, HitEnv, Model, Msg, initialModel } from './model';
import { IDENTITY, angleOf, apply } from './mat2d';
import { KNOB_LOCAL, rectToTransform } from './geom';
import { update } from './update';
import { view } from './view';

const env: HitEnv = { toView: IDENTITY, handlePx: 10, page: { width: 800, height: 560 } };
const ptr = (phase: 'down' | 'move' | 'up', x: number, y: number, shift = false): Msg => ({
  t: 'pointer',
  s: { phase, page: { x, y }, view: { x, y }, shift },
  env,
});
const drive = (m: Model, msgs: Msg[]): Model => msgs.reduce((acc, msg) => update(acc, msg)[0], m);

describe('annotation-core', () => {
  it('square tool: drag creates one annotation, a tap creates none', () => {
    const m = drive({ ...initialModel, tool: 'square' }, [
      ptr('down', 100, 100),
      ptr('move', 200, 160),
      ptr('up', 200, 160),
    ]);
    expect(m.order).toHaveLength(1);
    const c = apply(m.byId[m.order[0]].transform, { x: 0, y: 0 }); // unit-shape center → drag-rect center
    expect(c.x).toBeCloseTo(150);
    expect(c.y).toBeCloseTo(130);

    const tapped = drive({ ...initialModel, tool: 'square' }, [
      ptr('down', 100, 100),
      ptr('up', 100, 100),
    ]);
    expect(tapped.order).toHaveLength(0);
  });

  it('move drags the selected shape by the pointer delta', () => {
    let m = drive({ ...initialModel, tool: 'square' }, [
      ptr('down', 100, 100),
      ptr('move', 200, 200),
      ptr('up', 200, 200),
    ]);
    const id = m.order[0];
    const before = apply(m.byId[id].transform, { x: 0, y: 0 });
    m = drive(m, [
      ptr('down', before.x, before.y),
      ptr('move', before.x + 40, before.y + 25),
      ptr('up', before.x + 40, before.y + 25),
    ]);
    const after = apply(m.byId[id].transform, { x: 0, y: 0 });
    expect(after.x).toBeCloseTo(before.x + 40);
    expect(after.y).toBeCloseTo(before.y + 25);
  });

  it('rotate 90° four times is the identity', () => {
    let m = drive({ ...initialModel, tool: 'square' }, [
      ptr('down', 100, 100),
      ptr('move', 200, 180),
      ptr('up', 200, 180),
    ]);
    const before = m.byId[m.order[0]].transform;
    for (let i = 0; i < 4; i++) m = update(m, { t: 'rotate90' })[0];
    const after = m.byId[m.order[0]].transform;
    for (let k = 0; k < 6; k++) expect(after[k]).toBeCloseTo(before[k]);
  });

  it('view emits selection chrome for a single selection', () => {
    const m = drive({ ...initialModel, tool: 'square' }, [
      ptr('down', 100, 100),
      ptr('move', 200, 180),
      ptr('up', 200, 180),
    ]);
    const nodes = view(m);
    expect(nodes.some((n) => n.kind === 'rotateKnob')).toBe(true);
    expect(nodes.filter((n) => n.kind === 'handle')).toHaveLength(4);
  });

  it('create returns a persist effect (the only impure consequence)', () => {
    let m: Model = { ...initialModel, tool: 'square' };
    [ptr('down', 10, 10), ptr('move', 80, 60)].forEach((msg) => (m = update(m, msg)[0]));
    const [, effects] = update(m, ptr('up', 80, 60));
    expect(effects).toHaveLength(1);
    expect(effects[0].fx).toBe('persistCreate');
  });

  it('move snaps the dragged shape to a neighbour edge and emits a guide', () => {
    const a1 = {
      id: 'a1',
      kind: 'square' as const,
      color: '#000',
      transform: rectToTransform({ x: 100, y: 100 }, { x: 200, y: 180 }),
    }; // left=100
    const a2 = {
      id: 'a2',
      kind: 'square' as const,
      color: '#000',
      transform: rectToTransform({ x: 350, y: 100 }, { x: 450, y: 180 }),
    }; // left=350, center=400
    let m: Model = {
      ...initialModel,
      tool: 'select',
      byId: { a1, a2 },
      order: ['a1', 'a2'],
      seq: 2,
    };
    m = update(m, ptr('down', 400, 140))[0]; // grab a2 by its centre
    m = update(m, ptr('move', 154, 140))[0]; // raw left 104 → within 6px of a1.left=100
    const d = m.draft as Extract<Draft, { g: 'move' }>;
    expect(d.delta.x).toBeCloseTo(-250); // snapped from raw -246 so the left edges align at x=100
    expect(view(m).some((n) => n.kind === 'guide')).toBe(true);
  });

  it('rotation reads out the live angle and snaps near 45° multiples', () => {
    const sq = {
      id: 'a1',
      kind: 'square' as const,
      color: '#000',
      transform: rectToTransform({ x: 100, y: 100 }, { x: 200, y: 180 }),
    };
    const base: Model = {
      ...initialModel,
      tool: 'select',
      byId: { a1: sq },
      order: ['a1'],
      selected: ['a1'],
      seq: 1,
    };
    const rotateTo = (absDeg: number): Model => {
      const knob = apply(sq.transform, KNOB_LOCAL);
      const pivot = apply(sq.transform, { x: 0, y: 0 });
      const start = Math.atan2(knob.y - pivot.y, knob.x - pivot.x);
      const ang = (absDeg * Math.PI) / 180 - angleOf(sq.transform) + start;
      const target = { x: pivot.x + 100 * Math.cos(ang), y: pivot.y + 100 * Math.sin(ang) };
      let m = update(base, ptr('down', knob.x, knob.y))[0];
      m = update(m, ptr('move', target.x, target.y))[0];
      return m;
    };
    const readout = (m: Model): string | undefined =>
      (view(m).find((n) => n.kind === 'readout') as { text: string } | undefined)?.text;
    expect(readout(rotateTo(85))).toBe('85°'); // 5° away → shows raw
    expect(readout(rotateTo(86))).toBe('90°'); // 4° away → snaps to 90
  });
});
