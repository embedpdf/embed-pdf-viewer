/**
 * The fonts a text box is drawn in while someone types: resolved the way the
 * write will be when the edit starts, again after a pause once the text has a
 * character it wasn't resolved with, and drawn from the answer.
 */
import { standardFontCss, standardFontProgram } from '@embedpdf/core-fonts';
import type { FontCss, FontsCapability } from '@embedpdf/plugin-fonts/contract';
import type { AnnotationRef, ResolvedFontRun } from '@embedpdf/engine-core/runtime';
import { toPageRef } from '@embedpdf/engine-core/runtime';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { annotationHarness, type FileAnnotation } from '../harness';

const PAGE = toPageRef(1);
const REF: AnnotationRef = { kind: 'objectNumber', page: PAGE, objectNumber: 30 };

const freeText = (contents: string): FileAnnotation =>
  ({
    ref: REF,
    page: PAGE,
    hasAppearance: true,
    appearanceState: null,
    nm: null,
    invisible: false,
    hidden: false,
    print: true,
    noZoom: false,
    noRotate: false,
    noView: false,
    readOnly: false,
    locked: false,
    toggleNoView: false,
    lockedContents: false,
    contents,
    subject: null,
    author: null,
    createdAt: null,
    modifiedAt: null,
    blendMode: 'normal',
    subtype: 'free-text',
    intent: 'free-text',
    fontFamily: 'Minion-Regular',
    fontSize: 12,
    fontColor: '#000000',
    textAlign: 'left',
    richText: {
      body: {
        family: 'Minion',
        weight: 400,
        italic: false,
        size: 12,
        color: '#000000',
        decoration: [],
        script: 'normal',
        letterSpacing: 0,
        horizontalScale: 1,
        align: 'left',
        dir: 'ltr',
      },
      paragraphs: [{ runs: [{ text: contents }] }],
    },
    color: '#000000',
    interiorColor: null,
    opacity: 1,
    strokeWidth: 1,
    borderStyle: 'solid',
    rect: { left: 100, bottom: 700, right: 300, top: 740 },
    box: { left: 100, bottom: 700, right: 300, top: 740 },
  }) as unknown as FileAnnotation;

const program = (hash: string) => ({
  hash,
  family: `epdf-${hash}`,
  weight: 400,
  style: 'normal' as const,
  load: async () => new Uint8Array(),
});

const cssOf = (hash: string): FontCss => ({
  fontFamily: `"epdf-${hash}", sans-serif`,
  fontWeight: 400,
  fontStyle: 'normal',
  programs: [program(hash)],
});

/** A fonts plugin whose engine moves the box to Helvetica: its subset doesn't cover the text. */
function fakeFonts() {
  const answer = (program: string): ResolvedFontRun => ({
    font: 'helvetica',
    weight: 400,
    italic: false,
    substituted: true,
    program,
    fallbacks: [],
  });
  const fonts = {
    getFontList: () => null,
    getStatus: () => 'ready' as const,
    ensureLoaded: vi.fn(async () => {}),
    refresh: vi.fn(async () => {}),
    resolve: vi.fn(async (request: { runs: unknown[] }) => ({
      runs: request.runs.map(() => answer('helvetica')),
      missingCharacters: [],
    })),
    getProgram: vi.fn(),
    getFontCss: vi.fn(() => cssOf('minion')),
    getFaceCss: vi.fn(() => cssOf('face')),
    getRunCss: vi.fn((run: ResolvedFontRun) => cssOf(run.program!)),
    getFaceOfCssFamily: (css: string) =>
      css === 'epdf-minion' ? { family: 'Minion', weight: 400, italic: false } : null,
    getPaintFontsEpoch: () => 0,
    onFontListChanged: () => () => {},
  };
  return fonts as typeof fonts & FontsCapability;
}

async function editing() {
  const fonts = fakeFonts();
  const harness = annotationHarness({ fonts });
  vi.useRealTimers();
  await harness.load([freeText('hello')]);
  vi.useFakeTimers();
  harness.update.mockResolvedValue({
    annotation: freeText('hello'),
    appearance: { changed: false },
  });
  return { ...harness, fonts, item: () => harness.capability.listTextItems(PAGE)[0]! };
}

const flush = async () => {
  for (let i = 0; i < 5; i++) await Promise.resolve();
};

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('a text box being typed in', () => {
  it("is drawn in its own font's program until the engine answers, then in the answer's", async () => {
    const harness = await editing();
    harness.capability.text.begin(REF);
    expect(harness.item().css.fontFamily).toBe('"epdf-minion", sans-serif');

    await flush();
    expect(harness.fonts.resolve).toHaveBeenCalledWith(
      {
        annotation: REF,
        runs: [
          { text: '', fontFamily: 'Minion-Regular' },
          { text: 'hello', fontFamily: 'Minion-Regular' },
        ],
      },
      expect.anything(),
    );
    expect(harness.item().css.fontFamily).toBe('"epdf-helvetica", sans-serif');
    expect(harness.item().programs.map((mounted) => mounted.hash)).toEqual(['helvetica']);
  });

  it('is resolved again after a pause once it has a new character, not for one it had', async () => {
    const harness = await editing();
    harness.capability.text.begin(REF);
    await flush();
    expect(harness.fonts.resolve).toHaveBeenCalledTimes(1);

    harness.capability.draftRichText(REF, { paragraphs: [{ runs: [{ text: 'hellohello' }] }] });
    vi.advanceTimersByTime(300);
    await flush();
    expect(harness.fonts.resolve).toHaveBeenCalledTimes(1);

    harness.capability.draftRichText(REF, { paragraphs: [{ runs: [{ text: 'hello Ω' }] }] });
    expect(harness.fonts.resolve).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(300);
    await flush();
    expect(harness.fonts.resolve).toHaveBeenCalledTimes(2);
  });

  it("draws a run's face from the answer, and reads a program's family back as the face's", async () => {
    const harness = await editing();
    harness.capability.text.begin(REF);
    await flush();
    const id = harness.item().id;
    const body = harness.item().face;
    expect(harness.capability.getCssFontFamily(body, id)).toBe('"epdf-helvetica", sans-serif');
    expect(harness.capability.getCssFontFamily({ ...body, weight: 700 }, id)).toBe(
      '"epdf-face", sans-serif',
    );
    expect(harness.capability.getFamilyOfCss('epdf-minion')).toBe('Minion');
    // A family no font is reads back as it is.
    expect(harness.capability.getFamilyOfCss('epdf-brand-sans')).toBe('epdf-brand-sans');
  });
});

describe('a text box without the fonts plugin', () => {
  it('is drawn in the standard font the engine falls back to, in its built-in program', async () => {
    const harness = annotationHarness();
    vi.useRealTimers();
    await harness.load([{ ...freeText('hello'), fontFamily: 'times-roman' } as FileAnnotation]);
    vi.useFakeTimers();
    harness.capability.text.begin(REF);
    const item = harness.capability.listTextItems(PAGE)[0]!;
    expect(item.css.fontFamily).toBe(standardFontCss('times-roman').fontFamily);
    expect(item.programs).toEqual([standardFontProgram('times-roman')]);
    // A run's face, and a program's family read back as its face's.
    const bold = { family: 'Times New Roman', weight: 700, italic: false };
    expect(harness.capability.getCssFontFamily(bold, item.id)).toBe(
      standardFontCss('times-bold').fontFamily,
    );
    expect(harness.capability.getFamilyOfCss(standardFontProgram('times-bold').family)).toBe(
      'Times',
    );
  });
});
