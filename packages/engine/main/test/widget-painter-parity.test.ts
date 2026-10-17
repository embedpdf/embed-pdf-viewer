/**
 * The parity gate: the widget painter (`@embedpdf/core-form`) draws what the
 * engine's appearance generator writes. For a matrix of widgets (family,
 * font, size, fitted size, alignment, lines, comb, password, border style
 * and width, colours, check style, turn), the engine writes the appearance;
 * the test reads its content stream back as what it paints and compares it
 * with the painter's drawing, item by item, within 0.01 pt.
 *
 * It runs on the WebAssembly runtime: the browser's engine, and the one
 * whose fonts every engine draws the 14 standard fonts with.
 */
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { BARE_PAGE_FIXTURE_PDF } from '@embedpdf/engine-core/conformance';
import type {
  DocumentHandle,
  FormFieldDraft,
  FormFieldValue,
  LocalEngine,
  PageRef,
} from '@embedpdf/engine-core/runtime';

import {
  widgetDrawing,
  widgetScene,
  type DrawOp,
  type WidgetDrawing,
} from '../../../core/form/src';
import { createLocalEngine } from '../src/index';
import { formStreamsOf, paintedOf, type Clip, type Painted } from './helpers/appearanceOps';

const GEOMETRY = 0.01;
const COLOR = 0.003;

/** The painter's drawing as the items it paints, as `paintedOf` reads a stream. */
function paintedOfDrawing(drawing: WidgetDrawing): Painted[] {
  const items: Painted[] = [];
  const walk = (ops: readonly DrawOp[], clip: Clip | null) => {
    for (const op of ops) {
      switch (op.kind) {
        case 'fill':
          items.push({
            kind: 'fill',
            path: [...op.path],
            color: [...op.color],
            evenOdd: op.evenOdd,
            clip,
          });
          break;
        case 'stroke':
          items.push({
            kind: 'stroke',
            path: [...op.path],
            color: [...op.color],
            width: op.width,
            dash: op.dash ? [...op.dash] : null,
            clip,
          });
          break;
        case 'clip':
          walk(op.ops, op.rect);
          break;
        case 'text':
          for (const run of op.runs) {
            items.push({
              kind: 'text',
              size: op.size,
              color: [...op.color],
              x: run.x,
              y: run.y,
              text: run.text,
              clip,
            });
          }
          break;
      }
    }
  };
  walk(drawing.ops, null);
  return items;
}

const near = (a: number, b: number, tolerance: number) => Math.abs(a - b) <= tolerance;

/** The first difference between what the engine paints and what the painter paints, or null. */
function differenceOf(engine: Painted[], painter: Painted[]): string | null {
  if (engine.length !== painter.length) {
    return `${engine.length} items painted, the painter has ${painter.length}:\n${JSON.stringify(engine)}\n${JSON.stringify(painter)}`;
  }
  for (let index = 0; index < engine.length; index += 1) {
    const a = engine[index]!;
    const b = painter[index]!;
    const where = `item ${index} (${a.kind})`;
    if (a.kind !== b.kind) return `${where}: the painter paints a ${b.kind}`;
    const colors = a.color.every((value, channel) => near(value, b.color[channel]!, COLOR));
    if (!colors) return `${where}: colour ${a.color} vs ${b.color}`;
    const clips =
      (a.clip === null && b.clip === null) ||
      (a.clip !== null &&
        b.clip !== null &&
        (['left', 'bottom', 'right', 'top'] as const).every((side) =>
          near(a.clip![side], b.clip![side], GEOMETRY),
        ));
    if (!clips) return `${where}: clip ${JSON.stringify(a.clip)} vs ${JSON.stringify(b.clip)}`;
    if (a.kind === 'text' && b.kind === 'text') {
      if (a.text !== b.text) return `${where}: "${a.text}" vs "${b.text}"`;
      if (!near(a.size, b.size, 0.001)) return `${where}: size ${a.size} vs ${b.size}`;
      if (!near(a.x, b.x, GEOMETRY) || !near(a.y, b.y, GEOMETRY)) {
        return `${where} "${a.text}": at ${a.x},${a.y} vs ${b.x},${b.y}`;
      }
      continue;
    }
    if (a.kind === 'stroke' && b.kind === 'stroke') {
      if (!near(a.width, b.width, GEOMETRY)) return `${where}: width ${a.width} vs ${b.width}`;
      if (JSON.stringify(a.dash) !== JSON.stringify(b.dash)) {
        return `${where}: dash ${JSON.stringify(a.dash)} vs ${JSON.stringify(b.dash)}`;
      }
    }
    if (a.kind === 'fill' && b.kind === 'fill' && a.evenOdd !== b.evenOdd) {
      return `${where}: even-odd ${a.evenOdd} vs ${b.evenOdd}`;
    }
    if ((a.kind === 'fill' || a.kind === 'stroke') && (b.kind === 'fill' || b.kind === 'stroke')) {
      if (a.path.length !== b.path.length) {
        return `${where}: ${JSON.stringify(a.path)} vs ${JSON.stringify(b.path)}`;
      }
      for (let segment = 0; segment < a.path.length; segment += 1) {
        const x = a.path[segment]! as Record<string, number | string>;
        const y = b.path[segment]! as Record<string, number | string>;
        if (x.op !== y.op) return `${where}: segment ${segment} ${x.op} vs ${y.op}`;
        for (const key of Object.keys(x)) {
          if (key === 'op') continue;
          if (!near(x[key] as number, y[key] as number, GEOMETRY)) {
            return `${where}: segment ${segment} ${key} ${x[key]} vs ${y[key]}`;
          }
        }
      }
    }
  }
  return null;
}

// ── the matrix ──

interface Case {
  name: string;
  draft: (page: PageRef) => FormFieldDraft;
  value?: FormFieldValue;
}

const FONTS = [
  'helvetica',
  'helvetica-bold',
  'helvetica-oblique',
  'times-roman',
  'times-bold-italic',
  'courier',
  'courier-bold-oblique',
] as const;
const ALIGNS = ['left', 'center', 'right'] as const;
const BORDERS = [
  { borderStyle: 'solid', strokeWidth: 1 },
  { borderStyle: 'solid', strokeWidth: 0 },
  { borderStyle: 'solid', strokeWidth: 3 },
  { borderStyle: 'dashed', strokeWidth: 1 },
  { borderStyle: 'dashed', strokeWidth: 2, dashArray: [4, 2] },
  { borderStyle: 'beveled', strokeWidth: 1 },
  { borderStyle: 'inset', strokeWidth: 2 },
  { borderStyle: 'underline', strokeWidth: 1 },
] as const;
const LOOK = { color: '#1f6feb', interiorColor: '#f6f8fa', fontColor: '#0d1117' };
const ROTATIONS = [0, 90, 180, 270] as const;

let counter = 0;
const named = (base: string) => `${base.replace(/[^a-z0-9]+/gi, '_')}_${(counter += 1)}`;
const box = (width: number, height: number) => ({ x: 20, y: 20, width, height });

const textCase = (
  name: string,
  value: string,
  widget: Record<string, unknown>,
  field: Record<string, unknown> = {},
  size = { width: 160, height: 24 },
): Case => ({
  name: `text: ${name}`,
  draft: (page) =>
    ({
      family: 'text',
      name: named(name),
      ...field,
      widgets: [{ page, box: box(size.width, size.height), ...LOOK, ...widget }],
    }) as FormFieldDraft,
  value: { value },
});

const CASES: Case[] = [
  ...FONTS.flatMap((fontFamily) =>
    [0, 8, 11, 14].map((fontSize) =>
      textCase(`${fontFamily} ${fontSize}`, 'Hég, quick €12.50 “fox”', { fontFamily, fontSize }),
    ),
  ),
  ...ALIGNS.flatMap((textAlign) =>
    ['Wide WWW text', 'i', ''].map((value) =>
      textCase(`align ${textAlign} "${value}"`, value, {
        fontFamily: 'helvetica',
        fontSize: 10,
        textAlign,
      }),
    ),
  ),
  ...BORDERS.map((border) =>
    textCase(`border ${JSON.stringify(border)}`, 'Bordered', {
      fontFamily: 'helvetica',
      fontSize: 10,
      ...border,
    }),
  ),
  textCase('no colours', 'Plain', {
    fontFamily: 'helvetica',
    fontSize: 10,
    color: undefined,
    interiorColor: undefined,
    fontColor: undefined,
  }),
  textCase('overflow, fitted', 'A long value that will not fit in this box at all', {
    fontFamily: 'helvetica',
    fontSize: 0,
  }),
  textCase(
    'tall, fitted',
    'Tall',
    { fontFamily: 'times-roman', fontSize: 0 },
    {},
    { width: 120, height: 70 },
  ),
  ...[0, 9].flatMap((fontSize) =>
    ALIGNS.map((textAlign) =>
      textCase(
        `multiline ${fontSize} ${textAlign}`,
        'The quick brown fox jumps over the lazy dog, again and again.\nSecond paragraph here\n\nAfter a blank line',
        { fontFamily: 'helvetica', fontSize, textAlign },
        { multiline: true },
        { width: 150, height: 90 },
      ),
    ),
  ),
  textCase(
    'multiline long word',
    'Supercalifragilisticexpialidocious word',
    { fontFamily: 'times-roman', fontSize: 12 },
    { multiline: true },
    { width: 80, height: 60 },
  ),
  textCase('password', 'secret', { fontFamily: 'helvetica', fontSize: 10 }, { password: true }),
  textCase(
    'max length',
    'truncate me please',
    { fontFamily: 'helvetica', fontSize: 10 },
    { maxLength: 8 },
  ),
  ...ALIGNS.flatMap((textAlign) =>
    [6, 10].map((maxLength) =>
      textCase(
        `comb ${maxLength} ${textAlign}`,
        'AiW1é',
        { fontFamily: 'courier', fontSize: 12, textAlign },
        { comb: true, maxLength },
      ),
    ),
  ),
  textCase(
    'comb proportional',
    'AiWm.',
    { fontFamily: 'helvetica', fontSize: 12 },
    { comb: true, maxLength: 7 },
  ),
  textCase(
    'comb fitted',
    '1234',
    { fontFamily: 'helvetica', fontSize: 0 },
    { comb: true, maxLength: 4 },
  ),
  ...ROTATIONS.map((rotation) =>
    textCase(
      `turned ${rotation}`,
      'Turned',
      { fontFamily: 'helvetica', fontSize: 10, rotation },
      {},
      { width: 100, height: 30 },
    ),
  ),
  ...ROTATIONS.slice(1).flatMap((rotation) => [
    {
      name: `checkbox: turned ${rotation}`,
      draft: (page: PageRef) =>
        ({
          family: 'checkbox',
          name: named('turned_check'),
          widgets: [{ page, box: box(30, 18), ...LOOK, rotation }],
        }) as FormFieldDraft,
      value: { checked: true } as FormFieldValue,
    },
    {
      name: `combo: turned ${rotation}`,
      draft: (page: PageRef) =>
        ({
          family: 'combobox',
          name: named('turned_combo'),
          options: [{ label: 'Alpha', value: 'a' }],
          widgets: [
            { page, box: box(120, 22), ...LOOK, fontFamily: 'helvetica', fontSize: 10, rotation },
          ],
        }) as FormFieldDraft,
      value: { value: 'a' } as FormFieldValue,
    },
    {
      name: `button: turned ${rotation}`,
      draft: (page: PageRef) =>
        ({
          family: 'pushbutton',
          name: named('turned_button'),
          widgets: [
            {
              page,
              box: box(90, 26),
              ...LOOK,
              fontFamily: 'helvetica',
              fontSize: 10,
              caption: 'Go',
              rotation,
            },
          ],
        }) as FormFieldDraft,
    },
  ]),
  // Combo boxes.
  ...[0, 10].flatMap((fontSize) =>
    BORDERS.slice(0, 6).map((border) => ({
      name: `combo: ${fontSize} ${JSON.stringify(border)}`,
      draft: (page: PageRef) =>
        ({
          family: 'combobox',
          name: named('combo'),
          options: [
            { label: 'Alpha', value: 'a' },
            { label: 'Beta', value: 'b' },
          ],
          widgets: [
            { page, box: box(140, 22), ...LOOK, fontFamily: 'helvetica', fontSize, ...border },
          ],
        }) as FormFieldDraft,
      value: { value: 'b' } as FormFieldValue,
    })),
  ),
  {
    name: 'combo: narrow, no button glyph',
    draft: (page) =>
      ({
        family: 'combobox',
        name: named('narrow'),
        options: [{ label: 'X', value: 'x' }],
        widgets: [{ page, box: box(18, 6), ...LOOK, fontFamily: 'helvetica', fontSize: 4 }],
      }) as FormFieldDraft,
  },
  // List boxes.
  ...[0, 9].flatMap((fontSize) =>
    [['b'], ['a', 'c'], []].map((selected) => ({
      name: `list: ${fontSize} ${selected.join(',')}`,
      draft: (page: PageRef) =>
        ({
          family: 'listbox',
          name: named('list'),
          multiSelect: true,
          options: ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'].map((value) => ({
            label: `Option ${value.toUpperCase()}`,
            value,
          })),
          widgets: [{ page, box: box(120, 60), ...LOOK, fontFamily: 'times-roman', fontSize }],
        }) as FormFieldDraft,
      value: { selectedValues: selected } as FormFieldValue,
    })),
  ),
  // Push buttons.
  ...[0, 10, 16].flatMap((fontSize) =>
    ['Submit', 'A much longer caption'].map((caption) => ({
      name: `button: ${fontSize} ${caption}`,
      draft: (page: PageRef) =>
        ({
          family: 'pushbutton',
          name: named('button'),
          widgets: [
            { page, box: box(110, 28), ...LOOK, fontFamily: 'helvetica-bold', fontSize, caption },
          ],
        }) as FormFieldDraft,
    })),
  ),
  // Check boxes and radio buttons, on and off.
  ...(['check', 'cross', 'star', 'circle', 'square', 'diamond', null] as const).flatMap(
    (checkStyle) =>
      [true, false].flatMap((checked) =>
        [{ strokeWidth: 1 }, { strokeWidth: 2 }, { strokeWidth: 0 }].map((border) => ({
          name: `checkbox: ${checkStyle} ${checked} ${border.strokeWidth}`,
          draft: (page: PageRef) =>
            ({
              family: 'checkbox',
              name: named('check'),
              widgets: [
                {
                  page,
                  box: box(18, 18),
                  ...LOOK,
                  ...border,
                  ...(checkStyle ? { checkStyle } : {}),
                },
              ],
            }) as FormFieldDraft,
          value: { checked } as FormFieldValue,
        })),
      ),
  ),
  ...(['circle', 'check', 'star', null] as const).flatMap((checkStyle) =>
    [true, false].map((checked) => ({
      name: `radio: ${checkStyle} ${checked}`,
      draft: (page: PageRef) =>
        ({
          family: 'radio',
          name: named('radio'),
          widgets: [
            {
              page,
              box: box(16, 16),
              ...LOOK,
              exportValue: 'one',
              ...(checkStyle ? { checkStyle } : {}),
            },
          ],
        }) as FormFieldDraft,
      value: { value: checked ? 'one' : null } as FormFieldValue,
    })),
  ),
];

describe('the widget painter draws what the engine writes', () => {
  let engine: LocalEngine;
  let doc: DocumentHandle;
  let page: PageRef;

  beforeAll(async () => {
    engine = createLocalEngine({ runtime: { prefer: 'wasm' } });
    doc = await engine.open(
      { kind: 'bytes', id: 'painter-parity', bytes: BARE_PAGE_FIXTURE_PDF.slice() },
      { scope: ['*'] } as never,
    );
    page = (await doc.pages.list()).pages[0]!.ref;
  });
  afterAll(async () => {
    await doc?.close();
  });

  test.each(CASES.map((testCase) => [testCase.name, testCase] as const))(
    '%s',
    async (_name, testCase) => {
      const created = await doc.forms.create(testCase.draft(page));
      if (testCase.value) await doc.forms.setValue(created.field.ref, testCase.value);
      const form = await doc.forms.list();
      const createdRef = created.field.ref;
      const field = form.fields.find(
        (each) =>
          each.ref.kind === 'objectNumber' &&
          createdRef.kind === 'objectNumber' &&
          each.ref.objectNumber === createdRef.objectNumber,
      )!;
      const ref = field.widgets[0]!.ref!;
      const row = form.widgets.find(
        (each) =>
          each.ref.kind === 'objectNumber' &&
          ref.kind === 'objectNumber' &&
          each.ref.objectNumber === ref.objectNumber,
      )!;
      const drawing = widgetDrawing(row, field);
      expect(drawing, 'the painter draws it').not.toBeNull();
      expect(drawing!.approximate).toBeNull();

      const bytes = await doc.page(page).annotations.exportAppearance!([ref]);
      const streams = formStreamsOf(bytes).filter((stream) => /\/BBox/.test(stream.dict));
      expect(streams.length, 'one appearance').toBeGreaterThan(0);
      const appearance = streams[streams.length - 1]!;
      const bboxSize = appearance.dict.match(
        /\/BBox\s*\[\s*([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)/,
      )!;
      expect([
        Number(bboxSize[3]) - Number(bboxSize[1]),
        Number(bboxSize[4]) - Number(bboxSize[2]),
      ]).toEqual([expect.closeTo(drawing!.width, 2), expect.closeTo(drawing!.height, 2)]);
      const enginePainted = paintedOf(appearance.content);
      if (process.env.PARITY_REPORT) {
        const kinds = enginePainted.map((item) => item.kind[0]).join('');
        console.log(
          `${testCase.name} :: ${kinds} :: ${enginePainted
            .filter((item) => item.kind === 'text')
            .map((item) => (item as { text: string }).text)
            .join(' | ')}`,
        );
      }
      expect(differenceOf(enginePainted, paintedOfDrawing(drawing!))).toBeNull();

      // On the page: the frame's corners land where the appearance's /Matrix,
      // fitted to the widget's rect, puts them (the page is 300 pt tall).
      const matrix = appearance.dict
        .match(/\/Matrix\s*\[([^\]]*)\]/)?.[1]
        ?.trim()
        .split(/\s+/)
        .map(Number) ?? [1, 0, 0, 1, 0, 0];
      const [a, b, c, d, e, f] = matrix as [number, number, number, number, number, number];
      const { width, height } = drawing!;
      const corners = [
        [0, 0],
        [width, 0],
        [width, height],
        [0, height],
      ].map(([u, v]) => [a * u! + c * v! + e, b * u! + d * v! + f]);
      const left = Math.min(...corners.map((p) => p[0]!));
      const bottom = Math.min(...corners.map((p) => p[1]!));
      const rect = row.rect as { x: number; y: number; width: number; height: number };
      const onPage = ([u, v]: [number, number]) => {
        const x = a * u + c * v + e - left + rect.x;
        const y = b * u + d * v + f - bottom + (300 - rect.y - rect.height);
        return [x, 300 - y];
      };
      const scene = widgetScene(drawing!, { box: row.box as never, rotation: row.rotation });
      const frame = scene.find((node) => node.kind === 'path');
      const first = drawing!.ops[0];
      const firstRect = first?.kind === 'fill' ? first.path[0] : undefined;
      if (frame?.kind === 'path' && firstRect?.op === 'rect') {
        const [x0, y0, x1, y1] = frame.d.match(/-?[\d.]+/g)!.map(Number);
        const [ex0, ey0] = onPage([firstRect.x, firstRect.y]);
        const [ex1, ey1] = onPage([firstRect.x + firstRect.width, firstRect.y]);
        expect([x0, y0, x1, y1].map((value) => Number(value!.toFixed(2)))).toEqual(
          [ex0!, ey0!, ex1!, ey1!].map((value) => Number(value.toFixed(2))),
        );
      }
    },
  );
});
