/**
 * The layout twin (`@embedpdf/core-text`) lays a form field out as the engine
 * does: for Latin and mixed-script values, in every shape of field, its runs
 * (font, text, left edge, baseline) are the ones the engine writes into the
 * field's appearance. The twin's fonts are the engine's: Helvetica's built-in
 * face, the fallbacks in the order `doc.fonts.resolve` gives, and the last
 * resort, each with the coverage and line metrics `doc.fonts.getProgram`
 * gives, measured with HarfBuzz as the engine shapes them.
 *
 * Positions agree to 0.1 pt. Inside a shaped run (Hebrew, Arabic) the engine
 * rounds each glyph to the thousandths of an em its PDF widths hold and
 * credits a kern to the glyph it follows; the twin measures the run whole and
 * shares its width between the characters by measuring prefixes. A run's
 * width agrees; one character's, which a comb centres in its cell, can be
 * off by part of a kern. In a joined script (Arabic) a letter's width
 * depends on the letter after it, so a comb's cells are checked for font,
 * text and order only.
 *
 * The painter (`@embedpdf/core-form`) draws those runs: text fields, combo
 * boxes, list box rows and push button captions in mixed scripts, through
 * `widgetDrawing` with the same fonts, against what the engine writes.
 */
import {
  BARE_PAGE_FIXTURE_PDF,
  drawnTextOf,
  type DrawnRun,
} from '@embedpdf/engine-core/conformance';
import { fontProgramFamily } from '@embedpdf/core-fonts';
import type {
  FontProgramInfo,
  FormFieldDraft,
  FormFieldValue,
  LocalDocumentHandle,
  LocalEngine,
  PageRef,
  StandardFont,
} from '@embedpdf/engine-core/runtime';
import * as hb from 'harfbuzzjs';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';

import {
  layoutField,
  standardTextFont,
  type FieldTextOptions,
  type TextFont,
  type TextFonts,
} from '../../../core/text/src';
import {
  standardPaintFont,
  widgetDrawing,
  type DrawOp,
  type PaintFont,
  type WidgetFonts,
} from '../../../core/form/src';
import { localEngine } from '../src/index';

const POSITION = 0.1;
const JOINED = /[\p{Script=Arabic}\p{Script=Syriac}\p{Script=Nko}\p{Script=Mongolian}]/u;

/** How wide text is in a program, shaped by HarfBuzz, in thousandths of the font size. */
function harfbuzzWidth(bytes: Uint8Array): (text: string, rtl: boolean) => number {
  const face = new hb.Face(new hb.Blob(bytes));
  const font = new hb.Font(face);
  return (text, rtl) => {
    const buffer = new hb.Buffer();
    buffer.addText(text);
    buffer.setDirection(rtl ? hb.Direction.RTL : hb.Direction.LTR);
    buffer.guessSegmentProperties();
    hb.shape(font, buffer);
    const advance = buffer.getGlyphPositions().reduce((sum, glyph) => sum + glyph.xAdvance, 0);
    return (advance * 1000) / face.upem;
  };
}

function programFont(hash: string, info: FontProgramInfo, bytes: Uint8Array): TextFont {
  return {
    key: hash,
    ascent: info.ascent,
    descent: info.descent,
    standard: false,
    covers: (codePoint) =>
      info.covers.some(({ start, count }) => codePoint >= start && codePoint < start + count),
    width: harfbuzzWidth(bytes),
  };
}

interface Shape {
  name: string;
  box: { width: number; height: number };
  widget: Record<string, unknown>;
  field: Record<string, unknown>;
  options: Omit<FieldTextOptions, 'plate'>;
}

const SINGLE = {
  fontSize: 12,
  alignment: 0,
  multiline: false,
  password: false,
  limit: 0,
  cells: 0,
  centered: true,
} as const;

const SHAPES: Shape[] = [
  ...(['left', 'center', 'right'] as const).map(
    (textAlign, alignment): Shape => ({
      name: textAlign,
      box: { width: 160, height: 24 },
      widget: { fontSize: 12, textAlign },
      field: {},
      options: { ...SINGLE, alignment: alignment as 0 | 1 | 2 },
    }),
  ),
  {
    name: 'fitted',
    box: { width: 160, height: 24 },
    widget: { fontSize: 0 },
    field: {},
    options: { ...SINGLE, fontSize: 0 },
  },
  {
    name: 'multi-line',
    box: { width: 90, height: 90 },
    widget: { fontSize: 10 },
    field: { multiline: true },
    options: { ...SINGLE, fontSize: 10, multiline: true, centered: false },
  },
  {
    name: 'comb',
    box: { width: 160, height: 24 },
    widget: { fontSize: 12 },
    field: { comb: true, maxLength: 9 },
    options: { ...SINGLE, cells: 9 },
  },
  {
    name: 'password',
    box: { width: 160, height: 24 },
    widget: { fontSize: 12 },
    field: { password: true },
    options: { ...SINGLE, password: true },
  },
];

const VALUES = [
  'Hég, quick €12.50 “fox”',
  'Hello שלום 123',
  '123 שלום',
  'ש\u05b8\u05c1לו\u05b9ם',
  'Hello مرحبا',
  'م\u064eر\u0652ح\u064eب\u064bا',
  'A中B',
  'שלום עולם, and some more words مرحبا بالعالم 42',
];

/** Runs as the reader merges them: consecutive left-to-right runs of one font, on one baseline, are one. */
interface Placed {
  font: string;
  text: string;
  x: number;
  baseline: number;
}

let engine: LocalEngine;
let doc: LocalDocumentHandle;
let page: PageRef;
let fonts: TextFonts;
/** A font's name in the written PDF, by the twin's key. */
const names = new Map<string, string>();
let fieldNumber = 0;

beforeAll(async () => {
  engine = localEngine({ runtime: { prefer: 'wasm' } });
  doc = await engine.open({
    kind: 'bytes',
    id: 'core-text-parity',
    bytes: BARE_PAGE_FIXTURE_PDF.slice(),
  });
  page = (await doc.pages.list()).pages[0]!.ref;

  const list = await doc.fonts.list();
  const resolution = await doc.fonts.resolve({ runs: [{ text: 'a', fontFamily: 'helvetica' }] });
  const loaded = async (hash: string) =>
    programFont(hash, await doc.fonts.getProgram(hash), await doc.fonts.downloadProgram(hash));
  const fallbacks = await Promise.all(resolution.runs[0]!.fallbacks.map(loaded));
  const lastResort = await loaded(list.lastResort.displayHash!);
  fonts = { face: standardTextFont('helvetica'), fallbacks, lastResort };

  names.set('helvetica', 'Helvetica');
  names.set('helvetica-bold', 'Helvetica-Bold');
  names.set('times-roman', 'Times-Roman');
  names.set(list.lastResort.displayHash!, 'EmbedPDFLastResort-Regular');
  for (const font of list.fonts) {
    const hash = font.programs[0]?.displayHash;
    if (hash && font.postScriptName) names.set(hash, font.postScriptName);
  }
});

afterAll(async () => {
  await engine?.destroy();
});

/** What the engine writes for `value` in a field of `shape`, read back. */
async function written(shape: Shape, value: string): Promise<Placed[]> {
  const { field } = await doc.forms.create({
    family: 'text',
    name: `parity_${(fieldNumber += 1)}`,
    ...shape.field,
    widgets: [
      {
        page,
        box: { x: 20, y: 20, ...shape.box },
        fontFamily: 'helvetica',
        borderStyle: 'solid',
        strokeWidth: 1,
        ...shape.widget,
      },
    ],
  } as FormFieldDraft);
  await doc.forms.setValue(field.ref, { value });
  const pdf = await doc.page(page).annotations.exportAppearance([field.widgets[0]!.ref!]);
  const drawn = await drawnTextOf(pdf);
  return (drawn[0]?.runs ?? []).map((run: DrawnRun) => ({
    font: run.font,
    text: run.text,
    x: run.x,
    baseline: run.baseline,
  }));
}

/** What the twin lays out for `value` in a field of `shape`, merged as the reader merges. */
function laidOut(shape: Shape, value: string): Placed[] {
  const { width, height } = shape.box;
  const laid = layoutField(value, fonts, {
    ...shape.options,
    plate: { left: 2, bottom: 1, right: width - 2, top: height - 1 },
  });
  const placed: (Placed & { rtl: boolean })[] = [];
  for (const line of laid.lines) {
    for (const run of line.runs) {
      const font = names.get(run.font.key) ?? run.font.key;
      const last = placed[placed.length - 1];
      if (
        last &&
        !last.rtl &&
        !run.rtl &&
        last.font === font &&
        Math.abs(last.baseline - line.baseline) < 0.001
      ) {
        last.text += run.text;
        continue;
      }
      placed.push({ font, text: run.text, x: run.x, baseline: line.baseline, rtl: run.rtl });
    }
  }
  return placed.map(({ rtl: _rtl, ...rest }) => rest);
}

describe('core-text lays a field out as the engine writes it', () => {
  for (const shape of SHAPES) {
    for (const value of VALUES) {
      test(`${shape.name}: ${value}`, async () => {
        const engineRuns = await written(shape, value);
        const twinRuns = laidOut(shape, value);
        expect(twinRuns.map(({ font, text }) => [font, text])).toEqual(
          engineRuns.map(({ font, text }) => [font, text]),
        );
        const cellsOfJoinedScript = shape.options.cells > 0 && JOINED.test(value);
        twinRuns.forEach((run, index) => {
          const expected = engineRuns[index]!;
          if (!cellsOfJoinedScript) {
            expect(Math.abs(run.x - expected.x), `${run.text}: x`).toBeLessThanOrEqual(POSITION);
          }
          expect(
            Math.abs(run.baseline - expected.baseline),
            `${run.text}: baseline`,
          ).toBeLessThanOrEqual(POSITION);
        });
      });
    }
  }
});

/** A program font as the painter draws it: its layout numbers, its program, its family. */
const paintFontOf = (font: TextFont): PaintFont => ({
  ...font,
  fontFamily: `"${fontProgramFamily(font.key)}"`,
  fontWeight: 400,
  fontStyle: 'normal',
  program: {
    hash: font.key,
    family: fontProgramFamily(font.key),
    weight: 400,
    style: 'normal',
    load: async () => new Uint8Array(),
  },
});

/** The painter's fonts for a widget in `face`: the fallbacks in the order the engine tries them for its style. */
async function widgetFontsOf(face: StandardFont): Promise<WidgetFonts> {
  const resolution = await doc.fonts.resolve({ runs: [{ text: 'a', fontFamily: face }] });
  const fallbacks = await Promise.all(
    resolution.runs[0]!.fallbacks.map(async (hash) =>
      programFont(hash, await doc.fonts.getProgram(hash), await doc.fonts.downloadProgram(hash)),
    ),
  );
  return {
    face: standardPaintFont(face),
    fallbacks: fallbacks.map(paintFontOf),
    lastResort: paintFontOf(fonts.lastResort!),
  };
}

interface WidgetCase {
  name: string;
  face: StandardFont;
  draft: (page: PageRef) => FormFieldDraft;
  value?: FormFieldValue;
}

const widgetBox = (width: number, height: number) => ({ x: 20, y: 20, width, height });
const LOOK = { borderStyle: 'solid', strokeWidth: 1 };

const WIDGET_CASES: WidgetCase[] = [
  ...['Hello שלום 123', '123 שלום', 'שָׁלוֹם', 'Hello مرحبا', 'A中B'].flatMap((value) =>
    (['left', 'right'] as const).map(
      (textAlign): WidgetCase => ({
        name: `text field, ${textAlign}: ${value}`,
        face: 'helvetica',
        draft: (page) =>
          ({
            family: 'text',
            name: `painted_${(fieldNumber += 1)}`,
            widgets: [
              {
                page,
                box: widgetBox(160, 24),
                fontFamily: 'helvetica',
                fontSize: 12,
                textAlign,
                ...LOOK,
              },
            ],
          }) as FormFieldDraft,
        value: { value },
      }),
    ),
  ),
  ...[0, 10].map(
    (fontSize): WidgetCase => ({
      name: `combo box, ${fontSize}`,
      face: 'helvetica',
      draft: (page) =>
        ({
          family: 'combobox',
          name: `painted_${(fieldNumber += 1)}`,
          options: [
            { label: 'שלום עולם', value: 'a' },
            { label: 'Hello مرحبا 42', value: 'b' },
          ],
          widgets: [{ page, box: widgetBox(160, 22), fontFamily: 'helvetica', fontSize, ...LOOK }],
        }) as FormFieldDraft,
      value: { value: 'b' },
    }),
  ),
  {
    name: 'list box',
    face: 'times-roman',
    draft: (page) =>
      ({
        family: 'listbox',
        name: `painted_${(fieldNumber += 1)}`,
        multiSelect: true,
        options: ['שלום', 'Hello مرحبا', '123 עולם', 'A中B'].map((label, index) => ({
          label,
          value: String(index),
        })),
        widgets: [
          { page, box: widgetBox(140, 70), fontFamily: 'times-roman', fontSize: 10, ...LOOK },
        ],
      }) as FormFieldDraft,
    value: { selectedValues: ['1'] },
  },
  ...['שלח טופס', 'Go مرحبا'].map(
    (caption): WidgetCase => ({
      name: `push button: ${caption}`,
      face: 'helvetica-bold',
      draft: (page) =>
        ({
          family: 'pushbutton',
          name: `painted_${(fieldNumber += 1)}`,
          widgets: [
            {
              page,
              box: widgetBox(110, 28),
              fontFamily: 'helvetica-bold',
              fontSize: 12,
              caption,
              ...LOOK,
            },
          ],
        }) as FormFieldDraft,
    }),
  ),
];

/** The painter's text runs, merged as the reader merges. */
function paintedRuns(ops: readonly DrawOp[]): Placed[] {
  const placed: (Placed & { rtl: boolean })[] = [];
  const walk = (each: readonly DrawOp[]) => {
    for (const op of each) {
      if (op.kind === 'clip') walk(op.ops);
      if (op.kind !== 'text') continue;
      for (const run of op.runs) {
        const font = names.get(run.font.key) ?? run.font.key;
        const last = placed[placed.length - 1];
        if (
          last &&
          !last.rtl &&
          !run.rtl &&
          last.font === font &&
          Math.abs(last.baseline - run.y) < 0.001
        ) {
          last.text += run.text;
          continue;
        }
        placed.push({ font, text: run.text, x: run.x, baseline: run.y, rtl: run.rtl });
      }
    }
  };
  walk(ops);
  return placed.map(({ rtl: _rtl, ...rest }) => rest);
}

describe('the painter draws mixed-script widget text as the engine writes it', () => {
  test.each(WIDGET_CASES.map((widgetCase) => [widgetCase.name, widgetCase] as const))(
    '%s',
    async (_name, widgetCase) => {
      const created = await doc.forms.create(widgetCase.draft(page));
      if (widgetCase.value) await doc.forms.setValue(created.field.ref, widgetCase.value);
      const form = await doc.forms.list();
      const fieldRef = created.field.ref;
      const field = form.fields.find(
        (each) =>
          each.ref.kind === 'objectNumber' &&
          fieldRef.kind === 'objectNumber' &&
          each.ref.objectNumber === fieldRef.objectNumber,
      )!;
      const ref = field.widgets[0]!.ref!;
      const row = form.widgets.find(
        (each) =>
          each.ref.kind === 'objectNumber' &&
          ref.kind === 'objectNumber' &&
          each.ref.objectNumber === ref.objectNumber,
      )!;
      const drawing = widgetDrawing(row, field, {}, await widgetFontsOf(widgetCase.face))!;
      expect(drawing.approximate).toBeNull();
      const painted = paintedRuns(drawing.ops);

      const drawn = await drawnTextOf(await doc.page(page).annotations.exportAppearance([ref]));
      const written = (drawn[0]?.runs ?? []).map((run) => ({
        font: run.font,
        text: run.text,
        x: run.x,
        baseline: run.baseline,
      }));
      expect(painted.map(({ font, text }) => [font, text])).toEqual(
        written.map(({ font, text }) => [font, text]),
      );
      painted.forEach((run, index) => {
        const expected = written[index]!;
        expect(Math.abs(run.x - expected.x), `${run.text}: x`).toBeLessThanOrEqual(POSITION);
        expect(
          Math.abs(run.baseline - expected.baseline),
          `${run.text}: baseline`,
        ).toBeLessThanOrEqual(POSITION);
      });
    },
  );
});
