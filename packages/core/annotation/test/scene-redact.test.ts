import { quadFromRect } from '@embedpdf/core-geometry';
import { defaultPaintFonts, standardPaintFont } from '@embedpdf/core-text';
import { toPageRef } from '@embedpdf/engine-core/runtime';
import { describe, expect, it } from 'vitest';

import { step } from './support';
import { DRAWN_FLAGS } from '../src/flags';
import { layoutRedactLabel, redactLabelText, scene } from '../src/scene';
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
    const texts = nodes.filter((node) => node.kind === 'textRun');
    expect(fills).toHaveLength(1);
    expect(fills[0]!.paint).toMatchObject({ fill: '#000000', opacity: 1 });
    expect(texts).toHaveLength(1);
    expect(texts[0]).toMatchObject({ kind: 'textRun', text: 'REDACTED', fontSize: 12 });
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
  const helvetica = defaultPaintFonts('helvetica');

  it('single label: left-aligned, its first baseline an ascent below the top, clipped to the region', () => {
    const [node] = layoutRedactLabel(REGION, { text: 'TOP', repeat: false }, LABEL_STYLE);
    expect(node).toMatchObject({ kind: 'textRun', text: 'TOP', fontSize: 12, clip: REGION });
    if (node!.kind !== 'textRun') throw new Error('expected a text run');
    expect(node.at.x).toBe(REGION.x);
    expect(node.at.y).toBeCloseTo(REGION.y + (12 * helvetica.face.ascent) / 1000, 2);
  });

  it('draws in the fonts the label carries; without them, its standard font, or Helvetica', () => {
    const courier = { ...helvetica, face: standardPaintFont('courier') };
    const [carried] = layoutRedactLabel(
      REGION,
      { text: 'A', repeat: false, fonts: courier },
      LABEL_STYLE,
    );
    expect(carried).toMatchObject({
      fontFamily: courier.face.fontFamily,
      program: courier.face.program,
    });
    const [times] = layoutRedactLabel(
      REGION,
      { text: 'A', repeat: false },
      { ...LABEL_STYLE, fontFamily: 'times-roman' },
    );
    expect(times).toMatchObject({ fontFamily: standardPaintFont('times-roman').fontFamily });
    const [other] = layoutRedactLabel(
      REGION,
      { text: 'A', repeat: false },
      { ...LABEL_STYLE, fontFamily: 'brand-sans' },
    );
    expect(other).toMatchObject({ fontFamily: helvetica.face.fontFamily });
  });

  it('alignment: right ends the line at the region edge', () => {
    const laid = redactLabelText(
      REGION,
      { text: 'X', repeat: false },
      { ...LABEL_STYLE, textAlign: 'right' },
      helvetica,
    )!;
    const [run] = laid.lines[0]!.runs;
    expect(run!.x + run!.width).toBeCloseTo(REGION.width, 3);
  });

  it('a label at a set size wraps to the region', () => {
    const laid = redactLabelText(
      { width: 60, height: 60 },
      { text: 'one two three four', repeat: false },
      LABEL_STYLE,
      helvetica,
    )!;
    expect(laid.lines.length).toBeGreaterThan(1);
  });

  it('fontSize 0 fits one label to the region on one line, at the size the engine picks', () => {
    // As the engine fits it: "Classified" in 352 × 114 draws at 80pt (90
    // would overflow the width).
    const laid = redactLabelText(
      { width: 352, height: 114 },
      { text: 'Classified', repeat: false },
      { ...LABEL_STYLE, fontSize: 0 },
      helvetica,
    )!;
    expect(laid.fontSize).toBe(80);
    expect(laid.lines).toHaveLength(1);
  });

  it('fontSize 0 fits a one-line region by its height', () => {
    const laid = redactLabelText(
      { width: 400, height: 14 },
      { text: 'A', repeat: false },
      { ...LABEL_STYLE, fontSize: 0 },
      helvetica,
    )!;
    expect(laid.fontSize).toBe(10);
  });

  it('fontSize 0 with repeat wraps the label, space-joined, at 12pt down past the region bottom', () => {
    // Measured from the engine: 3 labels a line in 180 × 120, 14.028pt apart.
    const laid = redactLabelText(
      { width: 180, height: 120 },
      { text: 'Classified', repeat: true },
      { ...LABEL_STYLE, fontSize: 0 },
      helvetica,
    )!;
    expect(laid.fontSize).toBe(12);
    const lines = laid.lines.map((line) => line.runs.map((run) => run.text).join(''));
    expect(lines[0]!.trim()).toBe('Classified Classified Classified');
    expect(laid.lines[0]!.baseline - laid.lines[1]!.baseline).toBeCloseTo(14.028, 2);
    expect(laid.contentHeight).toBeGreaterThanOrEqual(120);
    // Doubled one time fewer, the lines would end above the region's bottom.
    const labels = lines.join(' ').split(/\s+/).filter(Boolean).length;
    expect(Math.ceil(labels / 2 / 3) * 14.028).toBeLessThan(120);
  });

  it('a repeated label doubles at most ten times: 1,024 labels', () => {
    const huge = { width: 100000, height: 100000 };
    const laid = redactLabelText(huge, { text: 'A', repeat: true }, LABEL_STYLE, helvetica)!;
    const shown = laid.lines.flatMap((line) => line.runs.map((run) => run.text)).join('');
    expect(shown.split('A').length - 1).toBe(1024);
  });
});
