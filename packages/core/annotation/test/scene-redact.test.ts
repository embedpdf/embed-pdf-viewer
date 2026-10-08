import { quadFromRect } from '@embedpdf/core-geometry';
import { toPageRef } from '@embedpdf/engine-core/runtime';
import { describe, expect, it } from 'vitest';

import { step } from './support';
import { DRAWN_FLAGS } from '../src/flags';
import { HELVETICA_ASCENT, helveticaAdvance } from '../src/helvetica';
import { layoutRedactLabel, scene } from '../src/scene';
import type { ModelAnnotation, Model, RenderItem, TextStyle } from '../src/types';
import { initialModel } from '../src/update';
import { placed } from '../src/frame';

const REGION = { x: 10, y: 10, width: 200, height: 60 };

const LABEL_STYLE: TextStyle = {
  fontFamily: 'helvetica',
  fontSize: 12,
  fontColor: '#ffffff',
  textAlign: 'left',
};

function redactItem(overrides: Partial<Omit<RenderItem, 'frame' | 'raster'>> = {}): RenderItem {
  return placed({
    id: 'obj:1',
    ref: null,
    subtype: 'redact',
    geometry: { kind: 'box', box: REGION, rotation: 0, ellipse: false },
    box: REGION,
    style: {
      color: '#e44234',
      interiorColor: '#000000',
      strokeWidth: 1.5,
      opacity: 1,
      blendMode: 'normal',
      borderStyle: 'solid',
      dashArray: null,
      cloudyIntensity: null,
    },
    text: LABEL_STYLE,
    source: 'vector',
    selected: false,
    ...overrides,
  });
}

describe('hover model state', () => {
  const record = {
    id: 'obj:1',
    page: toPageRef(1),
    subtype: 'redact',
    flags: DRAWN_FLAGS,
  } as unknown as ModelAnnotation;
  const base: Model = {
    ...initialModel,
    byId: { 'obj:1': record },
    order: ['obj:1'],
  };

  it('sets and clears hovered, no effects', () => {
    const [hoveredModel, fx1] = step(base, { type: 'hover', id: 'obj:1' });
    expect(hoveredModel.hovered).toBe('obj:1');
    expect(fx1).toEqual([]);
    const [cleared, fx2] = step(hoveredModel, { type: 'hover', id: null });
    expect(cleared.hovered).toBe(null);
    expect(fx2).toEqual([]);
  });

  it('is a no-op (same model identity) when unchanged', () => {
    const [hoveredModel] = step(base, { type: 'hover', id: 'obj:1' });
    const [again] = step(hoveredModel, { type: 'hover', id: 'obj:1' });
    expect(again).toBe(hoveredModel);
  });

  it('clears hovered when the hovered annotation leaves the view', () => {
    const [hoveredModel] = step(base, { type: 'hover', id: 'obj:1' });
    const [afterForget] = step(hoveredModel, { type: 'forget', ids: ['obj:1'] });
    expect(afterForget.hovered).toBe(null);
  });
});

describe('redact scene', () => {
  it('rests as an outline: stroke only, no fill, no text', () => {
    const nodes = scene(redactItem());
    expect(nodes).toHaveLength(1);
    expect(nodes[0]).toMatchObject({
      kind: 'poly',
      closed: true,
      paint: { stroke: '#e44234', width: 1.5 },
    });
    expect((nodes[0] as { paint: { fill?: string } }).paint.fill).toBeUndefined();
  });

  it('hovered: fills opaquely and draws the label', () => {
    const nodes = scene(redactItem({ hovered: true, label: { text: 'REDACTED', repeat: false } }));
    const fills = nodes.filter((node) => node.kind === 'poly');
    const texts = nodes.filter((node) => node.kind === 'text');
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
        geometry: {
          kind: 'quads',
          quadPoints: [
            quadFromRect({ x: 0, y: 0, width: 50, height: 10 }),
            quadFromRect({ x: 0, y: 14, width: 30, height: 10 }),
          ],
        },
      }),
    );
    expect(nodes.filter((node) => node.kind === 'poly')).toHaveLength(2);
  });
});

describe('layoutRedactLabel', () => {
  it('single label: left-aligned at the top baseline', () => {
    const [node] = layoutRedactLabel(REGION, { text: 'TOP', repeat: false }, LABEL_STYLE);
    expect(node).toMatchObject({ kind: 'text', text: 'TOP', fontSize: 12 });
    if (node!.kind !== 'text') throw new Error('expected text node');
    expect(node.at.x).toBe(REGION.x);
    expect(node.at.y).toBeCloseTo(REGION.y + 12 * HELVETICA_ASCENT);
  });

  it("draws the label in the font's CSS family: a standard stack, or a registered key's face", () => {
    const [standard] = layoutRedactLabel(REGION, { text: 'A', repeat: false }, LABEL_STYLE);
    expect(standard).toMatchObject({ fontFamily: 'Helvetica, Arial, sans-serif' });
    const [registered] = layoutRedactLabel(
      REGION,
      { text: 'A', repeat: false },
      { ...LABEL_STYLE, fontFamily: 'brand-sans' },
    );
    expect(registered).toMatchObject({ fontFamily: '"epdf-brand-sans", sans-serif' });
  });

  it('alignment: right pushes the line to the region edge', () => {
    const [node] = layoutRedactLabel(
      REGION,
      { text: 'X', repeat: false },
      { ...LABEL_STYLE, textAlign: 'right' },
    );
    if (node!.kind !== 'text') throw new Error('expected text node');
    expect(node.at.x).toBeCloseTo(REGION.x + REGION.width - helveticaAdvance('X') * 12);
  });

  it('fontSize 0 fits one label to the region, at the size the engine picks', () => {
    // As the engine fits it: "Classified" in 352 × 114 draws at 80pt (90
    // would overflow the width).
    const [node] = layoutRedactLabel(
      { x: 0, y: 0, width: 352, height: 114 },
      { text: 'Classified', repeat: false },
      { ...LABEL_STYLE, fontSize: 0 },
    );
    expect(node).toMatchObject({ kind: 'text', fontSize: 80 });
  });

  it('fontSize 0 fits a one-line region by its height', () => {
    const [node] = layoutRedactLabel(
      { x: 0, y: 0, width: 400, height: 14 },
      { text: 'A', repeat: false },
      { ...LABEL_STYLE, fontSize: 0 },
    );
    expect(node).toMatchObject({ kind: 'text', fontSize: 10 });
  });

  it('fontSize 0 with repeat tiles at 12pt, like the engine', () => {
    // Measured from the engine: 3 labels a line in 180 × 120, 14.028pt apart.
    const nodes = layoutRedactLabel(
      { x: 0, y: 0, width: 180, height: 120 },
      { text: 'Classified', repeat: true },
      { ...LABEL_STYLE, fontSize: 0 },
    );
    expect(nodes[0]).toMatchObject({ kind: 'text', fontSize: 12 });
    const rows = new Set(nodes.map((node) => (node.kind === 'text' ? node.at.y : 0)));
    expect(nodes.length / rows.size).toBe(3);
    expect(rows.size).toBe(8);
  });

  it('repeat tiles a full grid that FITS the region (no bleed)', () => {
    const nodes = layoutRedactLabel(REGION, { text: 'AB', repeat: true }, LABEL_STYLE);
    expect(nodes.length).toBeGreaterThan(1);
    const width = helveticaAdvance('AB') * 12;
    for (const node of nodes) {
      if (node.kind !== 'text') throw new Error('expected text node');
      expect(node.at.x + width).toBeLessThanOrEqual(REGION.x + REGION.width + 1e-6);
      expect(node.at.y).toBeLessThanOrEqual(REGION.y + REGION.height);
    }
  });

  it('caps the tile count as a runaway guard', () => {
    const huge = { x: 0, y: 0, width: 100000, height: 100000 };
    const nodes = layoutRedactLabel(huge, { text: 'A', repeat: true }, LABEL_STYLE);
    expect(nodes.length).toBeLessThanOrEqual(400);
  });
});
