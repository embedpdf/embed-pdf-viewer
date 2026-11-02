import type { DocumentHandle } from '../engine/DocumentHandle';
import type { Engine } from '../engine/Engine';
import type { PageBox } from '../geometry/pageSpace';
import type { AnnotationRef } from '../identity/AnnotationRef';
import type { PageRef } from '../identity/PageRef';
import type { TextLayout } from '../text/layout';
import { drawnTextOf, type DrawnText } from './drawnText';
import type { ConformanceOptions, ConformanceTestRunner } from './runMetadataConformance';
import { EVERY_PERMISSION } from './fixtureScope';

/** The engine's default fallback fonts and its last resort, as their files name them. */
const HEBREW = 'NotoSansHebrew';
const ARABIC = 'NotoNaskhArabic';
const LAST_RESORT = 'EmbedPDFLastResort-Regular';

interface MixedScriptCase {
  name: string;
  value: string;
  /** What each font draws, in the order drawn, left to right. */
  runs: [font: string, text: string][];
  /** A text field's runs, when they differ: its direction is its text's. */
  fieldRuns?: [font: string, text: string][];
  /** What no font has. */
  missing?: string[];
}

const CASES: MixedScriptCase[] = [
  {
    name: 'Latin, Hebrew and digits',
    value: 'Hello שלום 123',
    // Digits after Hebrew read with it, right to left: they're drawn before it.
    runs: [
      ['Helvetica', 'Hello 123 '],
      [HEBREW, 'שלום'],
    ],
  },
  {
    name: 'digits, then Hebrew',
    value: '123 שלום',
    runs: [
      ['Helvetica', '123 '],
      [HEBREW, 'שלום'],
    ],
    fieldRuns: [
      [HEBREW, 'שלום'],
      ['Helvetica', ' 123'],
    ],
  },
  {
    name: 'Hebrew with points',
    value: 'שָׁלוֹם',
    runs: [[HEBREW, 'שָׁלוֹם']],
  },
  {
    name: 'Arabic with Latin',
    value: 'Hello مرحبا',
    runs: [
      ['Helvetica', 'Hello '],
      [ARABIC, 'مرحبا'],
    ],
  },
  {
    name: 'Arabic with harakat',
    value: 'مَرْحَبًا',
    runs: [[ARABIC, 'مَرْحَبًا']],
  },
  {
    name: 'a character no font has',
    value: 'A中B',
    runs: [
      ['Helvetica', 'A'],
      [LAST_RESORT, '中'],
      ['Helvetica', 'B'],
    ],
    missing: ['中'],
  },
];

/** A free text or a text field in Helvetica, holding `value`, in `box` on `page`. */
interface Writer {
  name: string;
  field: boolean;
  box: PageBox;
  write(
    doc: DocumentHandle,
    page: PageRef,
    value: string,
  ): Promise<{ ref: AnnotationRef; missing: string[] | undefined }>;
}

const PAGE_SIZE = { width: 300, height: 300 };

let fields = 0;

const WRITERS: Writer[] = [
  {
    name: 'free text',
    field: false,
    box: { x: 20, y: 20, width: 260, height: 40 },
    async write(doc, page, value) {
      const { annotation, meta } = await doc.page(page).annotations.create({
        subtype: 'free-text',
        box: this.box,
        fontFamily: 'helvetica',
        fontSize: 12,
        contents: value,
      });
      return { ref: annotation.ref, missing: meta.missingCharacters };
    },
  },
  {
    name: 'text field',
    field: true,
    box: { x: 20, y: 100, width: 260, height: 24 },
    async write(doc, page, value) {
      const { field } = await doc.forms.create({
        family: 'text',
        name: `mixed-${++fields}`,
        widgets: [
          {
            page,
            rect: this.box,
            fontFamily: 'helvetica',
            fontSize: 12,
          },
        ],
      });
      const { meta } = await doc.forms.setValue(field.ref, { value });
      return { ref: field.widgets[0]!.ref!, missing: meta.missingCharacters };
    },
  },
];

const RIGHT_TO_LEFT = /[\u0590-\u08FF\uFB1D-\uFDFF\uFE70-\uFEFF]/;

/**
 * The letters of `text` in order: without marks, and with repeats collapsed,
 * as each glyph of a cluster spells the cluster's first character.
 */
const lettersOf = (text: string): string[] =>
  [...text.replace(/\p{M}/gu, '')].filter((c, i, all) => i === 0 || c !== all[i - 1]);

/** What each font draws, in the order drawn: consecutive runs in one font merged. */
function byFont(drawn: DrawnText): [string, string][] {
  const merged: [string, string][] = [];
  for (const run of drawn.runs) {
    const last = merged[merged.length - 1];
    if (last && last[0] === run.font) {
      last[1] += run.text;
    } else {
      merged.push([run.font, run.text]);
    }
  }
  return merged;
}

/**
 * What's wrong with each run's direction and place: right-to-left glyphs
 * drawn in reverse with their text as /ActualText, the rest in order; one
 * baseline; runs left to right, each starting where the last ends (when its
 * font says its widths, as every embedded one does), inside the box.
 */
function problemsOf(drawn: DrawnText): string[] {
  const problems: string[] = [];
  const { box, runs } = drawn;
  runs.forEach((run, i) => {
    const label = `${run.font} "${run.text}"`;
    if (RIGHT_TO_LEFT.test(run.text)) {
      if (run.actualText !== run.text) problems.push(`${label} has no /ActualText`);
      if (lettersOf(run.glyphs).reverse().join('') !== lettersOf(run.text).join('')) {
        problems.push(`${label} is drawn "${run.glyphs}", not right to left`);
      }
    } else if (lettersOf(run.glyphs).join('') !== lettersOf(run.text).join('')) {
      problems.push(`${label} is drawn "${run.glyphs}"`);
    }
    if (run.baseline !== runs[0]!.baseline) problems.push(`${label} is on another baseline`);
    if (run.baseline <= box.bottom || run.baseline >= box.top) {
      problems.push(`${label} is above or below the box`);
    }
    const previous = runs[i - 1];
    if (previous ? run.x <= previous.x : run.x < box.left) {
      problems.push(`${label} starts at ${run.x}, out of order`);
    }
    if (run.end === undefined) {
      if (run.font !== 'Helvetica') problems.push(`${label} has no widths`);
      return;
    }
    const next = runs[i + 1];
    if (!(run.end > run.x)) problems.push(`${label} has no width`);
    if (next && Math.abs(run.end - next.x) > 0.01) {
      problems.push(`${label} ends at ${run.end}, not where the next starts (${next.x})`);
    }
    if (!next && run.end > box.right) {
      problems.push(`${label} ends at ${run.end}, past the box (${box.right})`);
    }
  });
  return problems;
}

/**
 * The characters of `layout` whose box isn't inside `box`, with where each
 * is. Characters with no box (a space can have none) are left out.
 */
function charactersOutside(layout: TextLayout, box: PageBox): string[] {
  const outside: string[] = [];
  const inside = ({ x, y }: { x: number; y: number }) =>
    x >= box.x - 0.5 &&
    x <= box.x + box.width + 0.5 &&
    y >= box.y - 0.5 &&
    y <= box.y + box.height + 0.5;
  for (let index = 0; index < layout.charCount; index++) {
    const quad = layout.charQuad(index);
    if (!quad) continue;
    const corners = [quad.upperLeft, quad.upperRight, quad.lowerLeft, quad.lowerRight];
    if (!corners.every(inside)) {
      const { x, y } = quad.upperLeft;
      outside.push(`character ${index} at (${x.toFixed(1)}, ${y.toFixed(1)})`);
    }
  }
  return outside;
}

/**
 * Mixed-script text as the shared text engine writes it, in a free text and
 * in a text field: read back from the appearance each exports, every run's
 * font, what it says, its direction and its place; flattened, every
 * character's box inside the box it was written in, and its right-to-left
 * runs reading as written. Hebrew and Arabic come
 * from the engine's default fallback fonts, a character none has from its
 * last resort. `opts.fixture` is a blank page.
 */
export function runMixedScriptConformance(
  runner: ConformanceTestRunner,
  opts: ConformanceOptions,
): void {
  const { describe, test, beforeAll, afterAll, expect } = runner;

  describe(`mixed-script conformance: ${opts.label}`, () => {
    let engine: Engine;

    beforeAll(async () => {
      engine = await opts.makeEngine();
    });

    afterAll(async () => {
      if (engine) await engine.destroy();
    });

    for (const writer of WRITERS) {
      for (const scriptCase of CASES) {
        test(`${writer.name}: ${scriptCase.name}`, async () => {
          const doc = await openFixture(engine, opts);
          try {
            // A page of its own: what earlier cases flattened stays on theirs.
            const [page] = (await doc.pages.insertBlank({ size: PAGE_SIZE })).insertedPages;
            const { ref, missing } = await writer.write(doc, page!, scriptCase.value);
            const pdf = await doc.page(ref.page).annotations.exportAppearance([ref]);
            const drawn = await drawnTextOf(pdf);
            expect(drawn).toHaveLength(1);
            const expected = (writer.field && scriptCase.fieldRuns) || scriptCase.runs;
            expect(byFont(drawn[0]!)).toEqual(expected);
            expect(problemsOf(drawn[0]!)).toEqual([]);
            expect(missing).toEqual(scriptCase.missing);

            // Flattened into the page, every character is boxed where it's
            // drawn, and each right-to-left run reads as it was written.
            await doc.page(ref.page).annotations.flatten([ref]);
            const layout = await doc.page(ref.page).text.layout();
            expect(layout.charCount > 0).toBe(true);
            expect(charactersOutside(layout, writer.box)).toEqual([]);
            const { text } = await doc.page(ref.page).text.get();
            const misread = drawn[0]!.runs
              .filter((run) => RIGHT_TO_LEFT.test(run.text) && !text.includes(run.text))
              .map((run) => run.text);
            expect(misread).toEqual([]);
          } finally {
            await doc.close();
          }
        });
      }
    }

    test('a change says what each op drew with no font, and what all of them did', async () => {
      const doc = await openFixture(engine, opts);
      try {
        const page = (await doc.pages.list()).pages[0]!;
        const freeText = (y: number, contents: string) =>
          ({
            type: 'annotations.create',
            page: page.ref,
            data: {
              subtype: 'free-text',
              box: { x: 20, y, width: 260, height: 40 },
              fontFamily: 'helvetica',
              contents,
            },
          }) as const;
        const result = await doc.apply({
          ops: [freeText(20, 'A中'), freeText(80, 'Hello'), freeText(140, '한中')],
        });
        expect(result.items.map((item) => item.meta.missingCharacters)).toEqual([
          ['中'],
          undefined,
          ['한', '中'],
        ]);
        expect(result.meta.missingCharacters).toEqual(['中', '한']);
      } finally {
        await doc.close();
      }
    });
  });
}

async function openFixture(engine: Engine, opts: ConformanceOptions): Promise<DocumentHandle> {
  if (opts.openKind === 'bytes') {
    return engine.open(
      { kind: 'bytes', id: opts.fixture.id, bytes: await opts.fixture.bytes() },
      EVERY_PERMISSION,
    );
  }
  return engine.open({ kind: 'id', id: opts.fixture.cloudId ?? opts.fixture.id });
}
