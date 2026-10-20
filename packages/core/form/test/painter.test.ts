/**
 * The painter on its own: what it says it can't draw exactly, and how its
 * drawing lands on the page. That it draws what the engine writes is the
 * engine's parity gate (`widget-painter-parity.test.ts`).
 */
import { layoutField } from '@embedpdf/core-text';
import type { FormFieldDTO, WidgetAnnotation } from '@embedpdf/engine-core/runtime';
import { describe, expect, it } from 'vitest';

import {
  defaultWidgetFonts,
  lastResortPaintFont,
  standardPaintFont,
  widgetDrawing,
  widgetScene,
  type PaintFont,
  type WidgetFonts,
} from '../src';

/** A Hebrew font: every letter 600 thousandths wide. */
const HEBREW: PaintFont = {
  key: 'hebrew-hash',
  ascent: 950,
  descent: -250,
  standard: false,
  covers: (codePoint) => codePoint >= 0x0590 && codePoint <= 0x05ff,
  width: (text) => [...text].length * 600,
  fontFamily: '"epdf-hebrew"',
  fontWeight: 400,
  fontStyle: 'normal',
  program: {
    hash: 'hebrew-hash',
    family: 'epdf-hebrew',
    weight: 400,
    style: 'normal',
    load: async () => new Uint8Array(),
  },
};
const FONTS: WidgetFonts = {
  face: standardPaintFont('helvetica'),
  fallbacks: [HEBREW],
  lastResort: lastResortPaintFont(),
};

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
    // WinAnsi can't write Cyrillic: the engine takes another font for it, which the painter
    // wasn't given; given the fonts, a box is what the engine draws too.
    expect(widgetDrawing(widget(), textField('Привет'))!.approximate).toBe('glyph');
    expect(widgetDrawing(widget(), textField('Привет'), {}, FONTS)!.approximate).toBeNull();
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
    const fitted = (height: number) =>
      layoutField('Hello', defaultWidgetFonts('helvetica'), {
        plate: { left: 0, bottom: 0, right: 200, top: height },
        fontSize: 0,
        alignment: 0,
        multiline: false,
        password: false,
        limit: 0,
        cells: 0,
        centered: true,
      }).fontSize;
    // The line is (945 + 224) / 1000 em tall: the biggest step whose line fits.
    expect([fitted(10), fitted(20), fitted(40)]).toEqual([8, 14, 30]);
  });

  it('lands on the page: a run at its left edge, clipped to the text box, turned with the widget', () => {
    const upright = widgetScene(widgetDrawing(widget(), textField('Hi'))!, {
      box: { x: 10, y: 20, width: 100, height: 20 },
    });
    const run = upright.find((node) => node.kind === 'textRun')!;
    expect(run).toMatchObject({ text: 'Hi', rtl: false, plain: true, at: { x: 12 } });
    expect(run.kind === 'textRun' && run.fontFamily).toMatch(/^"epdf-[0-9a-f]{16}", Helvetica/);
    // The face it draws in comes with it, for whatever draws it to mount.
    expect(run.kind === 'textRun' && run.program).toMatchObject({
      family: (run.kind === 'textRun' && run.fontFamily.slice(1, 22)) || '',
      weight: 400,
      style: 'normal',
    });
    expect(run.clip).toEqual({ x: 11, y: 21, width: 98, height: 18 });

    const turned = widgetScene(widgetDrawing(widget({ rotation: 90 }), textField('Hi'))!, {
      box: { x: 10, y: 20, width: 100, height: 20 },
      rotation: 90,
    });
    const turnedRun = turned.find((node) => node.kind === 'textRun')!;
    expect(turnedRun.kind === 'textRun' && turnedRun.rotation).toBe(90);
    // Turned a quarter clockwise about the box's middle (60, 30): the clip stands up.
    expect(turnedRun.clip).toEqual({ x: 51, y: -19, width: 18, height: 98 });
  });

  it('draws mixed scripts as runs in their fonts, in the order the engine draws them', () => {
    const scene = widgetScene(widgetDrawing(widget(), textField('Hello שלום 123'), {}, FONTS)!, {
      box: { x: 10, y: 20, width: 100, height: 20 },
    });
    const runs = scene.flatMap((node) =>
      node.kind === 'textRun' ? [[node.text, node.rtl, node.fontFamily.split(',')[0]]] : [],
    );
    const helvetica = standardPaintFont('helvetica').fontFamily.split(',')[0];
    expect(runs).toEqual([
      ['Hello ', false, helvetica],
      ['123', false, helvetica],
      [' ', true, helvetica],
      ['שלום', true, '"epdf-hebrew"'],
    ]);
    // Each starts where the one before it ends.
    const xs = scene.flatMap((node) => (node.kind === 'textRun' ? [node.at.x] : []));
    expect(xs).toEqual([...xs].sort((a, b) => a - b));
    const hebrew = scene.find(
      (node) => node.kind === 'textRun' && node.rtl && node.text === 'שלום',
    );
    expect(hebrew).toMatchObject({ plain: false, program: HEBREW.program });
  });
});
