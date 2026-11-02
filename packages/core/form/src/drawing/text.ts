/**
 * The families with text: a text field (`GenerateTextFieldFormAP` and
 * `GenerateTextFieldAP`), a combo box (`GenerateComboBoxFormAP`,
 * `GenerateComboBoxAP`), a list box (`GenerateListBoxFormAP`,
 * `GenerateListBoxAP`) and a push button's caption
 * (`GeneratePushButtonFormAP`). Each draws what its generator function writes,
 * in the same order.
 */
import { layoutField, type FieldText, type FieldTextOptions } from '@embedpdf/core-text';
import type { PaintFont, PaintFonts } from '@embedpdf/core-text';
import type { PdfRect } from '@embedpdf/engine-core/runtime';

import { BLACK, borderOps, boxOps, deflate, rectPath, type BorderStyleInfo } from './border';
import type { DrawOp, Rgb, TextRun } from './types';

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
  readonly fonts: PaintFonts;
  readonly fontSize: number;
  readonly textColor: Rgb | null;
  readonly alignment: 0 | 1 | 2;
}

export interface Drawn {
  readonly ops: DrawOp[];
  /** Characters no font the painter has: drawn as boxes. */
  readonly missing: readonly string[];
}

type Laid = FieldText<PaintFont>;

/** `text` laid out in the look's fonts, at its size unless `options` say. */
const laidOut = (
  look: TextLook,
  text: string,
  options: Omit<FieldTextOptions, 'fontSize'> & { readonly fontSize?: number },
): Laid => layoutField(text, look.fonts, { fontSize: look.fontSize, ...options });

/** Every run of the laid-out text, line by line, left to right. */
const runsOf = (laid: Laid): TextRun[] =>
  laid.lines.flatMap((line) =>
    line.runs.map(({ x, text, font, rtl, plain, width, joinsPrevious, joinsNext }) => ({
      x,
      y: line.baseline,
      text,
      font,
      rtl,
      plain,
      width,
      joinsPrevious,
      joinsNext,
    })),
  );

const textOp = (laid: Laid, color: Rgb): DrawOp => ({
  kind: 'text',
  size: laid.fontSize,
  color,
  runs: runsOf(laid),
});

/** One line, as a combo box, a list box row and a caption draw it. */
const ONE_LINE = { multiline: false, password: false, limit: 0, cells: 0 } as const;

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
): { readonly plate: PdfRect; readonly laid: Laid } {
  const width = look.border.width;
  const plate = deflate(look.bbox, f32(2 * width), width);
  const maxLength = field.maxLength ?? 0;
  const laid = laidOut(look, field.value, {
    plate,
    alignment: look.alignment,
    multiline: field.multiline,
    password: field.password,
    limit: field.comb ? 0 : maxLength,
    cells: field.comb ? maxLength : 0,
    // A one-line field's text has its middle at the plate's.
    centered: !field.multiline,
  });
  return { plate, laid };
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
  const { laid } = textFieldLayout(look, field);
  const text = textOp(laid, look.textColor ?? BLACK);
  ops.push({
    kind: 'clip',
    rect: deflate(bbox, width),
    ops: hasRuns(text) ? [text] : [],
  });
  return { ops, missing: laid.missing };
}

const hasRuns = (op: DrawOp) => op.kind === 'text' && op.runs.length > 0;

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
  const laid = laidOut(look, field.value, {
    ...ONE_LINE,
    plate: edit,
    alignment: 0,
    centered: true,
  });
  const text = textOp(laid, look.textColor ?? BLACK);
  if (hasRuns(text)) ops.push({ kind: 'clip', rect: edit, ops: [text] });
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
  return { ops, missing: laid.missing };
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
  const missing = new Set<string>();
  let y = body.top;
  // Text without a colour of its own paints in the colour the last row left.
  let fill: Rgb = BLACK;
  // PDFium counts rows from `/TI` as an unsigned number: a negative one draws none.
  const start = field.topIndex < 0 ? field.options.length : field.topIndex;
  for (let index = start; index < field.options.length; index += 1) {
    if (isFloatSmaller(y, body.bottom)) break;
    const option = field.options[index]!;
    // A row is one line, from the top of what is left.
    const laid = laidOut(look, option.label, {
      ...ONE_LINE,
      plate: { left: body.left, bottom: y, right: body.right, top: y },
      fontSize: look.fontSize === 0 || isFloatZero(look.fontSize) ? 12 : look.fontSize,
      alignment: 0,
      centered: false,
    });
    for (const character of laid.missing) missing.add(character);
    const height = laid.contentHeight;
    if (option.selected) {
      rows.push({
        kind: 'fill',
        path: [rectPath({ left: body.left, bottom: f32(y - height), right: body.right, top: y })],
        color: SELECTED_ROW,
        evenOdd: false,
      });
      rows.push(textOp(laid, WHITE));
      fill = WHITE;
    } else {
      fill = look.textColor ?? fill;
      rows.push(textOp(laid, fill));
    }
    y = f32(y - height);
  }
  if (rows.length) ops.push({ kind: 'clip', rect: body, ops: rows });
  return { ops, missing: [...missing] };
}

export function pushButtonOps(look: TextLook, caption: string | null): Drawn {
  const { bbox, border } = look;
  const ops = boxOps(bbox, border, look.background, look.borderColor);
  if (!caption) return { ops, missing: [] };
  const body = deflate(bbox, f32(2 * border.width), border.width);
  const laid = laidOut(look, caption, { ...ONE_LINE, plate: body, alignment: 1, centered: true });
  const text = textOp(laid, look.textColor ?? BLACK);
  if (hasRuns(text)) ops.push({ kind: 'clip', rect: deflate(bbox, border.width), ops: [text] });
  return { ops, missing: laid.missing };
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
