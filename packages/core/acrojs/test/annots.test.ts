import { createContext, runInContext } from 'node:vm';
import { describe, expect, it } from 'vitest';

import {
  ANNOT_WRITABLE_KEYS,
  PRELUDE_SOURCE,
  scriptColorToRgb,
  type AcroJsVmGlobal,
  type ScriptAnnotInput,
  type ScriptColorArray,
  type ScriptInput,
  type ScriptOutput,
} from '../src';

const annot = (
  name: string,
  objectNumber: number,
  overrides: Partial<ScriptAnnotInput> = {},
): ScriptAnnotInput => ({
  ref: { kind: 'objectNumber', pageObjectNumber: 3, annotObjectNumber: objectNumber },
  name,
  subtype: 'square',
  page: 0,
  rect: [10, 10, 110, 60],
  contents: '',
  author: 'Alex',
  subject: 'demo',
  strokeColor: ['RGB', 0, 1, 0],
  fillColor: ['T'],
  opacity: 1,
  width: 1,
  borderStyle: 'S',
  dash: [],
  hidden: false,
  print: true,
  readOnly: false,
  locked: false,
  noView: false,
  toggleNoView: false,
  opaqueBody: false,
  ...overrides,
});

const input = (
  annots: ScriptAnnotInput[],
  extra: Partial<ScriptInput> = {},
): ScriptInput => ({
  document: { id: 'doc-1', fileName: 'demo.pdf', pageCount: 2, pageNumber: 0 },
  identity: { name: '', loginName: '', corporation: '', email: '' },
  environment: { nowMs: Date.UTC(2026, 6, 15), utcOffsetMinutes: 0, randomSeed: 7 },
  fields: [],
  annots,
  annotPages: [0],
  event: { kind: 'widget-activate' },
  ...extra,
});

function createVm(): AcroJsVmGlobal {
  const context = createContext({});
  runInContext(PRELUDE_SOURCE, context);
  return context as unknown as AcroJsVmGlobal;
}
const plain = (output: ScriptOutput): ScriptOutput => JSON.parse(JSON.stringify(output));

describe('the annots plane', () => {
  it("runs 02's exact hover pattern: getAnnots by page, find by name, recolor", () => {
    const vm = createVm();
    const output = plain(
      vm.__acrojsRun(
        `function findAnnot(doc, page, name) {
           var annots = doc.getAnnots({nPage: page});
           if (!annots) return null;
           for (var i = 0; i < annots.length; i++) {
             if (annots[i].name == name) return annots[i];
           }
           return null;
         }
         var a = findAnnot(this, 0, 'hoverSquare');
         if (a) {
           a.strokeColor = ['RGB', 0.14, 0.43, 0.89];
           a.fillColor = ['RGB', 0.86, 0.93, 1];
         }`,
        input([annot('hoverSquare', 21), annot('other', 22)]),
      ),
    );
    expect(output.error).toBeUndefined();
    expect(output.annotEffects).toEqual([
      {
        ref: { kind: 'objectNumber', pageObjectNumber: 3, annotObjectNumber: 21 },
        patch: {
          strokeColor: ['RGB', 0.14, 0.43, 0.89],
          fillColor: ['RGB', 0.86, 0.93, 1],
        },
      },
    ]);
  });

  it('returns null when nothing matches (Acrobat parity) and diagnoses unfetched pages', () => {
    const vm = createVm();
    const output = plain(
      vm.__acrojsRun(
        `this.result = [
           this.getAnnots({nPage: 1}) === null,
           this.getAnnots() === null ? 'null' : 'list',
           this.getAnnot(0, 'ghost') === null,
         ];`,
        input([annot('real', 21)]),
      ),
    );
    expect(output.error).toBeUndefined();
    expect(output.diagnostics.some((d) => d.message.includes('page 1'))).toBe(true);
    // Omitted nPage over a partial plane also names the deviation.
    expect(
      output.diagnostics.some((d) => d.message.includes('whole-document')),
    ).toBe(true);
  });

  it('derives canonical diffs: last write wins, flags fold into one patch, restores collapse', () => {
    const vm = createVm();
    const output = plain(
      vm.__acrojsRun(
        `var a = this.getAnnot(0, 'a');
         a.opacity = 0.3;
         a.opacity = 0.7;            // last write wins
         a.hidden = true;
         a.noView = true;
         a.width = 5;
         a.width = 1;                // restored to original — collapses out
         var b = this.getAnnot(0, 'b');
         b.contents = 'annotated';`,
        input([annot('a', 21), annot('b', 22)]),
      ),
    );
    expect(output.annotEffects).toEqual([
      {
        ref: { kind: 'objectNumber', pageObjectNumber: 3, annotObjectNumber: 21 },
        patch: { opacity: 0.7, flags: { hidden: true, noView: true } },
      },
      {
        ref: { kind: 'objectNumber', pageObjectNumber: 3, annotObjectNumber: 22 },
        patch: { contents: 'annotated' },
      },
    ]);
  });

  it('refuses invalid-subtype and opaque-body writes with diagnostics, never throwing', () => {
    const vm = createVm();
    const output = plain(
      vm.__acrojsRun(
        `var h = this.getAnnot(0, 'mark');
         h.fillColor = ['RGB', 1, 0, 0];   // highlight has no fill
         h.strokeColor = 'red';            // invalid shape
         var s = this.getAnnot(0, 'logo');
         s.rect = [0, 0, 50, 50];          // opaque body
         s.hidden = true;                  // flags still fine on opaque bodies`,
        input([
          annot('mark', 21, { subtype: 'highlight' }),
          annot('logo', 22, { subtype: 'stamp', opaqueBody: true }),
        ]),
      ),
    );
    expect(output.error).toBeUndefined();
    expect(output.annotEffects).toEqual([
      {
        ref: { kind: 'objectNumber', pageObjectNumber: 3, annotObjectNumber: 22 },
        patch: { flags: { hidden: true } },
      },
    ]);
    const messages = output.diagnostics.map((d) => d.message).join('\n');
    expect(messages).toContain('not writable');
    expect(messages).toContain('invalid value');
    expect(messages).toContain('opaque appearance');
  });

  it('setProps batches through the same validation; getProps reads the staged view', () => {
    const vm = createVm();
    const output = plain(
      vm.__acrojsRun(
        `var a = this.getAnnot(0, 'a');
         a.setProps({ strokeColor: ['G', 0], width: 4, opacity: 0.5 });
         this.roundTrip = a.getProps().width;`,
        input([annot('a', 21)]),
      ),
    );
    expect(output.annotEffects[0]?.patch).toEqual({
      strokeColor: ['G', 0],
      width: 4,
      opacity: 0.5,
    });
  });

  it('ships the color object: constants, convert vectors, cross-space equal', () => {
    const vm = createVm();
    const output = plain(
      vm.__acrojsRun(
        `var a = this.getAnnot(0, 'a');
         a.strokeColor = color.red;
         this.checks = [
           color.equal(['G', 0.5], ['RGB', 0.5, 0.5, 0.5]),
           color.equal(color.cyan, ['RGB', 0, 1, 1]),
           color.convert(['CMYK', 0, 1, 0, 0], 'RGB').join(','),
         ];
         if (!this.checks[0] || !this.checks[1]) a.opacity = 0; // fail loudly`,
        input([annot('a', 21)]),
      ),
    );
    expect(output.annotEffects).toEqual([
      {
        ref: { kind: 'objectNumber', pageObjectNumber: 3, annotObjectNumber: 21 },
        patch: { strokeColor: ['RGB', 1, 0, 0] },
      },
    ]);
  });

  it('honours explicit event type/name overrides and keeps kind-derived defaults', () => {
    const vm = createVm();
    const hover = plain(
      vm.__acrojsRun(
        `this.seen = event.type + ':' + event.name;
         var a = this.getAnnot(0, 'a');
         a.contents = event.type + ':' + event.name;`,
        input([annot('a', 21)], {
          event: { kind: 'widget-activate', type: 'Field', name: 'Mouse Enter' },
        }),
      ),
    );
    expect(hover.annotEffects[0]?.patch.contents).toBe('Field:Mouse Enter');
    const legacy = plain(
      vm.__acrojsRun(
        `var a = this.getAnnot(0, 'a'); a.contents = event.type + ':' + event.name;`,
        input([annot('a', 21)]),
      ),
    );
    expect(legacy.annotEffects[0]?.patch.contents).toBe('Field:Mouse Up');
  });
});

describe('parity pins (prelude twins of exported tables)', () => {
  it('the exported ANNOT_WRITABLE_KEYS matches the prelude enforcement per subtype', () => {
    const appearanceKeys = [
      'strokeColor',
      'fillColor',
      'opacity',
      'width',
      'borderStyle',
      'dash',
      'rect',
    ] as const;
    const valueFor = (key: string): string =>
      key === 'strokeColor' || key === 'fillColor'
        ? "['RGB', 0.2, 0.2, 0.2]"
        : key === 'opacity'
          ? '0.42'
          : key === 'width'
            ? '3'
            : key === 'borderStyle'
              ? "'D'"
              : key === 'dash'
                ? '[2, 2]'
                : '[1, 2, 3, 4]';
    for (const [subtype, writable] of Object.entries(ANNOT_WRITABLE_KEYS)) {
      const vm = createVm();
      const program = appearanceKeys
        .map((key) => `a.${key === 'borderStyle' ? 'style' : key} = ${valueFor(key)};`)
        .join('\n');
      const output = plain(
        vm.__acrojsRun(
          `var a = this.getAnnot(0, 'x');\n${program}`,
          input([annot('x', 21, { subtype })]),
        ),
      );
      const patched = Object.keys(output.annotEffects[0]?.patch ?? {});
      for (const key of appearanceKeys) {
        expect(patched.includes(key), `${subtype}.${key}`).toBe(writable.includes(key));
      }
    }
  });

  it('host color conversions match the prelude color object', () => {
    const samples: ScriptColorArray[] = [
      ['G', 0.25],
      ['RGB', 0.1, 0.5, 0.9],
      ['CMYK', 0.2, 0.4, 0.6, 0.1],
    ];
    for (const sample of samples) {
      const vm = createVm();
      const output = plain(
        vm.__acrojsRun(
          `var a = this.getAnnot(0, 'x');
           a.dash = color.convert(${JSON.stringify(sample)}, 'RGB').slice(1);`,
          input([annot('x', 21)]),
        ),
      );
      const rgb = scriptColorToRgb(sample)!;
      const converted = output.annotEffects[0]?.patch.dash as number[];
      expect(converted[0]).toBeCloseTo(rgb.r, 6);
      expect(converted[1]).toBeCloseTo(rgb.g, 6);
      expect(converted[2]).toBeCloseTo(rgb.b, 6);
    }
  });
});
