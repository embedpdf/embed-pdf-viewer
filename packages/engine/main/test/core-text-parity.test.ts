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
 */
import {
  BARE_PAGE_FIXTURE_PDF,
  drawnTextOf,
  type DrawnRun,
} from '@embedpdf/engine-core/conformance';
import type {
  FontProgramInfo,
  LocalDocumentHandle,
  FormFieldDraft,
  LocalEngine,
  PageRef,
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
