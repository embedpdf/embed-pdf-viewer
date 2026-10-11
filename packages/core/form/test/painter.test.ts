/**
 * The painter on its own: what it says it can't draw exactly, and how its
 * drawing lands on the page. That it draws what the engine writes is the
 * engine's parity gate (`widget-painter-parity.test.ts`).
 */
import type { FormFieldDTO, WidgetAnnotation } from '@embedpdf/engine-core/runtime';
import { describe, expect, it } from 'vitest';

import { layoutVariableText, layoutFontOf, widgetDrawing, widgetScene } from '../src';

const widget = (patch: Partial<WidgetAnnotation> = {}): WidgetAnnotation =>
  ({
    subtype: 'widget',
    rect: { x: 10, y: 20, width: 100, height: 20 },
    box: { x: 10, y: 20, width: 100, height: 20 },
    rotation: null,
    appearanceState: null,
    color: '#000000',
    interiorColor: '#ffffff',
    strokeWidth: 1,
    borderStyle: 'solid',
    dashArray: null,
    fontFamily: 'helvetica',
    fontSize: 10,
    fontColor: '#ff0000',
    textAlign: 'left',
    caption: null,
    checkStyle: null,
    ...patch,
  }) as WidgetAnnotation;

const textField = (value: string): FormFieldDTO =>
  ({
    family: 'text',
    value,
    multiline: false,
    password: false,
    comb: false,
    maxLength: null,
  }) as FormFieldDTO;

describe('the painter', () => {
  it('says when its drawing may differ from the engine picture', () => {
    expect(widgetDrawing(widget(), textField('Plain'))!.approximate).toBeNull();
    // WinAnsi can't write Cyrillic: the engine takes another font for it.
    expect(widgetDrawing(widget(), textField('Привет'))!.approximate).toBe('glyph');
    // A font that isn't one of the 14 lays out with Helvetica's numbers.
    expect(widgetDrawing(widget({ fontFamily: 'Roboto' }), textField('Plain'))!.approximate).toBe(
      'font',
    );
    expect(widgetDrawing(widget({ fontFamily: 'symbol' }), textField('abc'))!.approximate).toBe(
      'symbolic-font',
    );
  });

  it("doesn't draw a signature or an unknown family", () => {
    expect(widgetDrawing(widget(), { family: 'signature' } as FormFieldDTO)).toBeNull();
    expect(widgetDrawing(widget(), { family: 'unknown' } as FormFieldDTO)).toBeNull();
  });

  it('shows the text it is given over the value', () => {
    const drawing = widgetDrawing(widget(), textField('1234.5'), { text: '$1,234.50' })!;
    const clip = drawing.ops.find((op) => op.kind === 'clip')!;
    expect(clip.kind === 'clip' && clip.ops[0]?.kind === 'text' && clip.ops[0].runs[0]!.text).toBe(
      '$1,234.50',
    );
  });

  it('fits a size of 0 to the box, with the engine sizes', () => {
    const font = layoutFontOf('helvetica')!;
    const fitted = (height: number) =>
      layoutVariableText('Hello', font, {
        plate: { left: 0, bottom: 0, right: 200, top: height },
        fontSize: 0,
        alignment: 0,
        multiline: false,
        limit: 0,
        cells: 0,
      }).fontSize;
    // The line is (945 + 224) / 1000 em tall: the biggest step whose line fits.
    expect([fitted(10), fitted(20), fitted(40)]).toEqual([8, 14, 30]);
  });

  it('lands on the page: glyphs at their advances, clipped to the text box, turned with the widget', () => {
    const upright = widgetScene(widgetDrawing(widget(), textField('Hi'))!, {
      box: { x: 10, y: 20, width: 100, height: 20 },
    });
    const glyphs = upright.find((node) => node.kind === 'glyphs')!;
    expect(glyphs.kind === 'glyphs' && glyphs.offsets).toEqual([0, 7.22]);
    expect(glyphs.kind === 'glyphs' && glyphs.fontFamily).toMatch(
      /^"epdf-[0-9a-f]{16}", Helvetica/,
    );
    // The face it draws in comes with it, for whatever draws it to mount.
    expect(glyphs.kind === 'glyphs' && glyphs.program).toMatchObject({
      family: (glyphs.kind === 'glyphs' && glyphs.fontFamily.slice(1, 22)) || '',
      weight: 400,
      style: 'normal',
    });
    expect(glyphs.clip).toEqual({ x: 11, y: 21, width: 98, height: 18 });

    const turned = widgetScene(widgetDrawing(widget({ rotation: 90 }), textField('Hi'))!, {
      box: { x: 10, y: 20, width: 100, height: 20 },
      rotation: 90,
    });
    const run = turned.find((node) => node.kind === 'glyphs')!;
    expect(run.kind === 'glyphs' && run.rotation).toBe(90);
    // Turned a quarter clockwise about the box's middle (60, 30): the clip stands up.
    expect(run.clip).toEqual({ x: 51, y: -19, width: 18, height: 98 });
  });
});
