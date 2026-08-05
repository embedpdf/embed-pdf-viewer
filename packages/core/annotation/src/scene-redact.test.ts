import { describe, expect, it } from 'vitest';
import { initialModel, update } from './update';
import { layoutRedactLabel, scene } from './scene';
import type { Annot, Model, RenderItem, TextStyle } from './types';
import { DRAWN_FLAGS } from './flags';

const REGION = { x: 10, y: 10, width: 200, height: 60 };

const LABEL_STYLE: TextStyle = {
  fontFamily: 'helvetica',
  fontSize: 12,
  fontColor: '#ffffff',
  textAlign: 'left',
};

function redactItem(overrides: Partial<RenderItem> = {}): RenderItem {
  return {
    id: 'obj:1',
    ref: null,
    subtype: 'redact',
    geom: { t: 'rect', rect: REGION, ellipse: false },
    box: REGION,
    style: {
      color: '#e44234',
      interiorColor: '#000000',
      strokeWidth: 1.5,
      opacity: 1,
      blendMode: 'normal',
      border: { kind: 'solid' },
    },
    text: LABEL_STYLE,
    source: 'vector',
    selected: false,
    ...overrides,
  };
}

describe('hover model state', () => {
  const annot = { id: 'obj:1', pon: 1, subtype: 'redact', flags: DRAWN_FLAGS } as unknown as Annot;
  const base: Model = {
    ...initialModel,
    byId: { 'obj:1': annot },
    order: ['obj:1'],
  };

  it('sets and clears hovered, no effects', () => {
    const [hoveredModel, fx1] = update(base, { t: 'hover', id: 'obj:1' });
    expect(hoveredModel.hovered).toBe('obj:1');
    expect(fx1).toEqual([]);
    const [cleared, fx2] = update(hoveredModel, { t: 'hover', id: null });
    expect(cleared.hovered).toBe(null);
    expect(fx2).toEqual([]);
  });

  it('is a no-op (same model identity) when unchanged', () => {
    const [hoveredModel] = update(base, { t: 'hover', id: 'obj:1' });
    const [again] = update(hoveredModel, { t: 'hover', id: 'obj:1' });
    expect(again).toBe(hoveredModel);
  });

  it('clears hovered when the hovered annotation is removed', () => {
    const [hoveredModel] = update(base, { t: 'hover', id: 'obj:1' });
    const [afterRemove] = update(hoveredModel, { t: 'remove', ids: ['obj:1'] });
    expect(afterRemove.hovered).toBe(null);
  });
});

describe('redact scene', () => {
  it('rests as an outline: stroke only, no fill, no text', () => {
    const nodes = scene(redactItem());
    expect(nodes).toHaveLength(1);
    expect(nodes[0]).toMatchObject({
      kind: 'rect',
      paint: { stroke: '#e44234', width: 1.5 },
    });
    expect((nodes[0] as { paint: { fill?: string } }).paint.fill).toBeUndefined();
  });

  it('hovered: fills opaquely and draws the label', () => {
    const nodes = scene(redactItem({ hovered: true, label: { text: 'REDACTED', repeat: false } }));
    const fills = nodes.filter((n) => n.kind === 'rect');
    const texts = nodes.filter((n) => n.kind === 'text');
    expect(fills).toHaveLength(1);
    expect(fills[0]!.paint).toMatchObject({ fill: '#000000', opacity: 1 });
    expect(texts).toHaveLength(1);
    expect(texts[0]).toMatchObject({ kind: 'text', text: 'REDACTED', fontSize: 12 });
  });

  it('hovered without interiorColor or label paints nothing (ISO transparent)', () => {
    const item = redactItem({ hovered: true });
    item.style = { ...item.style, interiorColor: null };
    expect(scene(item)).toHaveLength(0);
  });

  it('text marks (quads) fill per quad on hover', () => {
    const nodes = scene(
      redactItem({
        hovered: true,
        geom: {
          t: 'quads',
          quads: [
            [
              { x: 0, y: 0 },
              { x: 50, y: 0 },
              { x: 0, y: 10 },
              { x: 50, y: 10 },
            ],
            [
              { x: 0, y: 14 },
              { x: 30, y: 14 },
              { x: 0, y: 24 },
              { x: 30, y: 24 },
            ],
          ],
        },
      }),
    );
    expect(nodes.filter((n) => n.kind === 'rect')).toHaveLength(2);
  });
});

describe('layoutRedactLabel', () => {
  it('single label: left-aligned at the top baseline', () => {
    const [node] = layoutRedactLabel(REGION, { text: 'TOP', repeat: false }, LABEL_STYLE);
    expect(node).toMatchObject({ kind: 'text', text: 'TOP', fontSize: 12 });
    if (node!.kind !== 'text') throw new Error('expected text node');
    expect(node.at.x).toBe(REGION.x);
    expect(node.at.y).toBeCloseTo(REGION.y + 12 * 0.95);
  });

  it('alignment: right pushes the line to the region edge', () => {
    const [node] = layoutRedactLabel(
      REGION,
      { text: 'X', repeat: false },
      { ...LABEL_STYLE, textAlign: 'right' },
    );
    if (node!.kind !== 'text') throw new Error('expected text node');
    const textW = 1 * 12 * 0.55;
    expect(node.at.x).toBeCloseTo(REGION.x + REGION.width - textW);
  });

  it('fontSize 0 auto-fits to the region height', () => {
    const [node] = layoutRedactLabel(
      REGION,
      { text: 'A', repeat: false },
      { ...LABEL_STYLE, fontSize: 0 },
    );
    if (node!.kind !== 'text') throw new Error('expected text node');
    expect(node.fontSize).toBeCloseTo(REGION.height * 0.6);
  });

  it('repeat tiles a full grid that FITS the region (no bleed)', () => {
    const nodes = layoutRedactLabel(REGION, { text: 'AB', repeat: true }, LABEL_STYLE);
    expect(nodes.length).toBeGreaterThan(1);
    const charW = 12 * 0.55;
    for (const n of nodes) {
      if (n.kind !== 'text') throw new Error('expected text node');
      expect(n.at.x + 2 * charW).toBeLessThanOrEqual(REGION.x + REGION.width + 1e-6);
      expect(n.at.y).toBeLessThanOrEqual(REGION.y + REGION.height);
    }
  });

  it('caps the tile count as a runaway guard', () => {
    const huge = { x: 0, y: 0, width: 100000, height: 100000 };
    const nodes = layoutRedactLabel(huge, { text: 'A', repeat: true }, LABEL_STYLE);
    expect(nodes.length).toBeLessThanOrEqual(400);
  });
});
