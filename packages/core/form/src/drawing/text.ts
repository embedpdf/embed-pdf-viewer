/**
 * The families with text: a text field (`GenerateTextFieldFormAP` and
 * `GenerateTextFieldAP`), a combo box (`GenerateComboBoxFormAP`,
 * `GenerateComboBoxAP`), a list box (`GenerateListBoxFormAP`,
 * `GenerateListBoxAP`) and a push button's caption
 * (`GeneratePushButtonFormAP`). Each draws what its generator function writes,
 * in the same order.
 */
import type { LayoutFont } from '../font';
import { BLACK, borderOps, boxOps, deflate, rectPath, type BorderStyleInfo } from './border';
import type { DrawOp, Rgb, TextRun } from './types';
import { textRuns } from '../layout/edit';
import { layoutVariableText, type PdfRect, type TextLayout } from '../layout/variable-text';

const f32 = Math.fround;
const isFloatZero = (value: number) => value < 0.0001 && value > -0.0001;
const isFloatBigger = (left: number, right: number) =>
  left > right && !isFloatZero(f32(left - right));
const isFloatSmaller = (left: number, right: number) =>
  left < right && !isFloatZero(f32(left - right));

/** What every text family reads from its widget. */
export interface TextLook {
  readonly bbox: PdfRect;
  readonly border: BorderStyleInfo;
  readonly background: Rgb | null;
  readonly borderColor: Rgb | null;
  readonly font: LayoutFont;
  readonly fontSize: number;
  readonly textColor: Rgb | null;
  readonly alignment: 0 | 1 | 2;
}

export interface Drawn {
  readonly ops: DrawOp[];
  /** A character the font can't write. */
  readonly approximate: boolean;
}

const contentHeight = (layout: TextLayout) => f32(layout.content.top - layout.content.bottom);
const plateHeight = (plate: PdfRect) => f32(plate.top - plate.bottom);

const textOp = (look: TextLook, layout: TextLayout, runs: TextRun[], color: Rgb): DrawOp => ({
  kind: 'text',
  font: look.font.font,
  size: layout.fontSize,
  color,
  runs,
});

/** What a text field's text depends on, besides its look. */
export interface TextFieldText {
  readonly value: string;
  readonly multiline: boolean;
  readonly password: boolean;
  readonly comb: boolean;
  readonly maxLength: number | null;
}

/** A text field's text as the generator lays it out, in its plate: the box inside the border. */
export function textFieldLayout(
  look: TextLook,
  field: TextFieldText,
): { readonly plate: PdfRect; readonly layout: TextLayout } {
  const width = look.border.width;
  const plate = deflate(look.bbox, f32(2 * width), width);
  const maxLength = field.maxLength ?? 0;
  const layout = layoutVariableText(field.value, look.font, {
    plate,
    fontSize: look.fontSize,
    alignment: look.alignment,
    multiline: field.multiline,
    ...(field.password ? { substitute: '*' } : {}),
    limit: field.comb ? 0 : maxLength,
    cells: field.comb ? maxLength : 0,
  });
  return { plate, layout };
}

export function textFieldOps(look: TextLook, field: TextFieldText): Drawn {
  const { bbox, border } = look;
  const width = border.width;
  const ops: DrawOp[] = [];
  if (look.background) {
    ops.push({ kind: 'fill', path: [rectPath(bbox)], color: look.background, evenOdd: true });
  }
  if (border.style === 'solid') {
    if (look.borderColor && width > 0) {
      ops.push({
        kind: 'stroke',
        path: [rectPath(deflate(bbox, f32(width / 2)))],
        color: look.borderColor,
        width,
        dash: null,
      });
    }
  } else {
    ops.push(...borderOps(bbox, border, look.borderColor));
  }
  const { plate: body, layout } = textFieldLayout(look, field);
  const offset = field.multiline
    ? { x: 0, y: 0 }
    : { x: 0, y: f32(f32(contentHeight(layout) - plateHeight(body)) / 2) };
  const runs = textRuns(layout, offset, !field.comb);
  ops.push({
    kind: 'clip',
    rect: deflate(bbox, width),
    ops: runs.length ? [textOp(look, layout, runs, look.textColor ?? BLACK)] : [],
  });
  return { ops, approximate: layout.approximate };
}

export function comboBoxOps(look: TextLook, field: { readonly value: string }): Drawn {
  const { bbox, border } = look;
  const ops: DrawOp[] = [];
  if (look.background) {
    ops.push({ kind: 'fill', path: [rectPath(bbox)], color: look.background, evenOdd: false });
  }
  ops.push(...borderOps(bbox, border, look.borderColor));
  const body = deflate(bbox, border.width, border.width);
  const button = normalized({ ...body, left: f32(body.right - 13) });
  const edit = deflate(normalized({ ...body, right: button.left }), 4, 0);
  const layout = layoutVariableText(field.value, look.font, {
    plate: edit,
    fontSize: look.fontSize,
    alignment: 0,
    multiline: false,
    limit: 0,
    cells: 0,
  });
  const offset = { x: 0, y: f32(f32(contentHeight(layout) - plateHeight(edit)) / 2) };
  const runs = textRuns(layout, offset, true);
  if (runs.length) {
    ops.push({
      kind: 'clip',
      rect: edit,
      ops: [textOp(look, layout, runs, look.textColor ?? BLACK)],
    });
  }
  if (!isEmpty(button)) {
    const centerX = f32(f32(button.left + button.right) / 2);
    const centerY = f32(f32(button.top + button.bottom) / 2);
    const width = f32(button.right - button.left);
    const height = f32(button.top - button.bottom);
    if (isFloatBigger(width, 6) && isFloatBigger(height, 6)) {
      ops.push({
        kind: 'fill',
        path: [
          { op: 'move', x: f32(centerX - 3), y: f32(centerY + 1.5) },
          { op: 'line', x: f32(centerX + 3), y: f32(centerY + 1.5) },
          { op: 'line', x: centerX, y: f32(centerY - 1.5) },
          { op: 'line', x: f32(centerX - 3), y: f32(centerY + 1.5) },
        ],
        color: BLACK,
        evenOdd: false,
      });
    }
  }
  return { ops, approximate: layout.approximate };
}

/** The list box's selected rows: PDFium's form highlight. */
const SELECTED_ROW: Rgb = [0, 51 / 255, 113 / 255];
const WHITE: Rgb = [1, 1, 1];

export function listBoxOps(
  look: TextLook,
  field: {
    readonly options: readonly { readonly label: string; readonly selected: boolean }[];
    readonly topIndex: number;
  },
): Drawn {
  const { bbox, border } = look;
  const ops: DrawOp[] = [];
  if (look.background) {
    ops.push({ kind: 'fill', path: [rectPath(bbox)], color: look.background, evenOdd: false });
  }
  ops.push(...borderOps(bbox, border, look.borderColor));
  const body = deflate(bbox, border.width, border.width);
  const rows: DrawOp[] = [];
  let approximate = false;
  let y = body.top;
  // Text without a colour of its own paints in the colour the last row left.
  let fill: Rgb = BLACK;
  // PDFium counts rows from `/TI` as an unsigned number: a negative one draws none.
  const start = field.topIndex < 0 ? field.options.length : field.topIndex;
  for (let index = start; index < field.options.length; index += 1) {
    if (isFloatSmaller(y, body.bottom)) break;
    const option = field.options[index]!;
    const layout = layoutVariableText(option.label, look.font, {
      plate: { left: body.left, bottom: 0, right: body.right, top: 0 },
      fontSize: look.fontSize === 0 || isFloatZero(look.fontSize) ? 12 : look.fontSize,
      alignment: 0,
      multiline: false,
      limit: 0,
      cells: 0,
    });
    approximate ||= layout.approximate;
    const height = contentHeight(layout);
    const runs = textRuns(layout, { x: 0, y }, true);
    if (option.selected) {
      rows.push({
        kind: 'fill',
        path: [rectPath({ left: body.left, bottom: f32(y - height), right: body.right, top: y })],
        color: SELECTED_ROW,
        evenOdd: false,
      });
      rows.push(textOp(look, layout, runs, WHITE));
      fill = WHITE;
    } else {
      fill = look.textColor ?? fill;
      rows.push(textOp(look, layout, runs, fill));
    }
    y = f32(y - height);
  }
  if (rows.length) ops.push({ kind: 'clip', rect: body, ops: rows });
  return { ops, approximate };
}

export function pushButtonOps(look: TextLook, caption: string | null): Drawn {
  const { bbox, border } = look;
  const ops = boxOps(bbox, border, look.background, look.borderColor);
  if (!caption) return { ops, approximate: false };
  const body = deflate(bbox, f32(2 * border.width), border.width);
  const layout = layoutVariableText(caption, look.font, {
    plate: body,
    fontSize: look.fontSize,
    alignment: 1,
    multiline: false,
    limit: 0,
    cells: 0,
  });
  const offset = { x: 0, y: f32(f32(contentHeight(layout) - plateHeight(body)) / 2) };
  const runs = textRuns(layout, offset, true);
  if (runs.length) {
    ops.push({
      kind: 'clip',
      rect: deflate(bbox, border.width),
      ops: [textOp(look, layout, runs, look.textColor ?? BLACK)],
    });
  }
  return { ops, approximate: layout.approximate };
}

function normalized(rect: PdfRect): PdfRect {
  return {
    left: Math.min(rect.left, rect.right),
    right: Math.max(rect.left, rect.right),
    bottom: Math.min(rect.bottom, rect.top),
    top: Math.max(rect.bottom, rect.top),
  };
}

const isEmpty = (rect: PdfRect) => rect.left >= rect.right || rect.bottom >= rect.top;
