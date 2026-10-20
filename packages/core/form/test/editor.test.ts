/**
 * The editor's layout puts the text where the painter draws it: a CSS line box of
 * `lineHeight`, inside `padding`, centred for one line and from the top for several, gives the
 * painter's baselines, and a comb's even spacing gives a fixed-width face's cells.
 */
import type { FormFieldDTO, StandardFont, WidgetAnnotation } from '@embedpdf/engine-core/runtime';
import { describe, expect, it } from 'vitest';

import {
  standardPaintFont,
  textEditorLayout,
  widgetDrawing,
  type DrawOp,
  type TextRun,
} from '../src';

const widget = (patch: Partial<WidgetAnnotation> = {}): WidgetAnnotation =>
  ({
    subtype: 'widget',
    rect: { x: 10, y: 20, width: 120, height: 24 },
    box: { x: 10, y: 20, width: 120, height: 24 },
    rotation: null,
    appearanceState: null,
    color: '#000000',
    interiorColor: null,
    strokeWidth: 1,
    borderStyle: 'solid',
    dashArray: null,
    fontFamily: 'helvetica',
    fontSize: 10,
    fontColor: null,
    textAlign: 'left',
    caption: null,
    checkStyle: null,
    ...patch,
  }) as WidgetAnnotation;

const textField = (patch: Partial<FormFieldDTO & { family: 'text' }> = {}): FormFieldDTO =>
  ({
    family: 'text',
    value: '',
    multiline: false,
    password: false,
    comb: false,
    maxLength: null,
    ...patch,
  }) as FormFieldDTO;

/** The painter's text: its size and runs. */
function paintedText(row: WidgetAnnotation, field: FormFieldDTO) {
  const walk = (ops: readonly DrawOp[]): Extract<DrawOp, { kind: 'text' }>[] =>
    ops.flatMap((op) => (op.kind === 'text' ? [op] : op.kind === 'clip' ? walk(op.ops) : []));
  const [text] = walk(widgetDrawing(row, field)!.ops);
  return text!;
}

/** Where the CSS line box puts the first baseline, from the box's top. */
function cssBaseline(row: WidgetAnnotation, field: FormFieldDTO, text: string): number {
  const layout = textEditorLayout(row, field, text)!;
  const ascent =
    (standardPaintFont(row.fontFamily as StandardFont).ascent * layout.fontSize) / 1000;
  const content = row.box!.height - layout.padding.top - layout.padding.bottom;
  const multiline = field.family === 'text' && field.multiline;
  const lineTop = layout.padding.top + (multiline ? 0 : (content - layout.lineHeight) / 2);
  return lineTop + ascent;
}

describe('textEditorLayout', () => {
  it('centres one line where the painter draws it, at the size it draws', () => {
    for (const [fontFamily, fontSize, borderStyle] of [
      ['helvetica', 10, 'solid'],
      ['times-roman', 14, 'beveled'],
      ['courier-bold', 0, 'inset'],
    ] as const) {
      const row = widget({ fontFamily, fontSize, borderStyle });
      const field = textField({ value: 'Ada Lovelace' });
      const painted = paintedText(row, field);
      const layout = textEditorLayout(row, field, 'Ada Lovelace')!;
      expect(layout.fontSize).toBeCloseTo(painted.size, 5);
      const run = painted.runs[0] as TextRun;
      expect(layout.padding.left).toBeCloseTo(run.x, 2);
      expect(cssBaseline(row, field, 'Ada Lovelace')).toBeCloseTo(row.box!.height - run.y, 2);
    }
  });

  it('starts several lines at the top, a line apart', () => {
    const row = widget({ box: { x: 10, y: 20, width: 120, height: 80 }, fontSize: 9 });
    const field = textField({ value: 'one\ntwo', multiline: true });
    const runs = paintedText(row, field).runs;
    const layout = textEditorLayout(row, field, 'one\ntwo')!;
    expect(cssBaseline(row, field, 'one\ntwo')).toBeCloseTo(80 - runs[0]!.y, 2);
    expect(runs[0]!.y - runs[1]!.y).toBeCloseTo(layout.lineHeight, 3);
  });

  it('fits the size to the text being typed', () => {
    const row = widget({ fontSize: 0 });
    const short = textEditorLayout(row, textField(), 'Ada')!;
    const long = textEditorLayout(row, textField(), 'Ada Lovelace, Countess of Lovelace')!;
    expect(long.fontSize).toBeLessThan(short.fontSize);
  });

  it('spaces a comb by its cells', () => {
    const row = widget({ fontFamily: 'courier', fontSize: 12 });
    const field = textField({ value: '1234', comb: true, maxLength: 6 });
    const runs = paintedText(row, field).runs;
    const layout = textEditorLayout(row, field, '1234')!;
    expect(layout.comb).toBe(true);
    const advance = 600 * 0.012;
    runs.forEach((run, index) =>
      expect(layout.padding.left + index * (advance + layout.letterSpacing)).toBeCloseTo(run.x, 2),
    );
    // Empty, it says where the first character will go.
    expect(
      textEditorLayout(row, textField({ comb: true, maxLength: 6 }), '')!.padding.left,
    ).toBeCloseTo(runs[0]!.x, 2);
  });

  it('is only for text fields', () => {
    expect(textEditorLayout(widget(), { family: 'checkbox' } as FormFieldDTO, '')).toBeNull();
  });
});
