import {
  reload,
  type DocumentEvent,
  type DocumentHandle,
  type HostFontProgram,
  type HostTextMeasurer,
} from '@embedpdf/core';
import { createTestContext, LOCAL_ENGINE_BRAND } from '@embedpdf/core/testing';
import {
  LAST_RESORT_HASH,
  fontProgramFamily,
  lastResortFontProgram,
  standardFontProgram,
} from '@embedpdf/core-fonts';
import {
  isStandardFontName,
  type Font,
  type FontList,
  type FontProgram,
  type FontResolveRequest,
} from '@embedpdf/engine-core/runtime';
import { describe, expect, it, vi } from 'vitest';

import { createFontsController } from '../src/controller';
import { fallbackHashes, fontForFace, foldFontList } from '../src/model';

const hashOf = (seed: string) => seed.repeat(64).slice(0, 64);

const program = (displayHash: string, over: Partial<FontProgram> = {}): FontProgram => ({
  displayHash,
  sourceHash: displayHash,
  embedded: 'whole',
  format: 'truetype',
  embeddingPermission: 'installable',
  canDownload: true,
  ...over,
});

const font = (over: Partial<Font> & Pick<Font, 'name' | 'familyName'>): Font => ({
  source: 'document',
  weight: 400,
  italic: false,
  postScriptName: null,
  canChoose: true,
  restrictions: [],
  programs: [],
  ...over,
});

const ROBOTO = font({
  name: 'Roboto-Regular',
  familyName: 'Roboto',
  postScriptName: 'Roboto-Regular',
  programs: [program(hashOf('a'))],
});
const ROBOTO_BOLD = font({
  name: 'Roboto-Bold',
  familyName: 'Roboto',
  weight: 700,
  programs: [program(hashOf('b'))],
});
const NOTO_HEBREW = font({
  name: 'noto-hebrew',
  familyName: 'Noto Sans Hebrew',
  source: 'engine',
  programs: [program(hashOf('c'))],
});
const ARIAL = font({
  name: 'arial',
  familyName: 'Arial',
  source: 'engine',
  programs: [program(hashOf('d'))],
});
const SUBSET = font({
  name: 'Minion',
  familyName: 'Minion',
  canChoose: false,
  restrictions: ['subset'],
  programs: [program(hashOf('e'), { embedded: 'subset', canDownload: false })],
});

const LIST: FontList = {
  fonts: [NOTO_HEBREW, ROBOTO, ROBOTO_BOLD, SUBSET],
  fallbacks: ['noto-hebrew'],
  lastResort: program(LAST_RESORT_HASH),
};

const origin = { kind: 'local' as const, sessionId: 's', sub: null, ts: 0, serverId: null };
const fontsChanged = { type: 'fonts.changed', origin } as DocumentEvent;

/** The Hebrew letters: what the fallback in the list covers. */
const HEBREW_LETTERS = { start: 0x05d0, count: 27 };

function harness(options: { local?: boolean; list?: FontList; measurer?: HostTextMeasurer } = {}) {
  let current = options.list ?? LIST;
  const fonts = {
    list: vi.fn(async () => current),
    // A box keeps the font it asks for, with the list's fallbacks.
    resolve: vi.fn(async (request: FontResolveRequest) => ({
      runs: request.runs.map((run) => {
        const name = 'fontFamily' in run ? run.fontFamily : 'helvetica';
        const listed = current.fonts.find((candidate) => candidate.name === name);
        const own = listed?.programs[0];
        return {
          font: name,
          weight: listed?.weight ?? 400,
          italic: listed?.italic ?? false,
          substituted: false,
          program: isStandardFontName(name)
            ? standardFontProgram(name).hash
            : own?.canDownload
              ? own.displayHash
              : null,
          fallbacks: fallbackHashes(current),
        };
      }),
      missingCharacters: [],
    })),
    getProgram: vi.fn(async (hash: string) => ({
      ...program(hash),
      covers: hash === hashOf('c') ? [HEBREW_LETTERS] : [{ start: 32, count: 95 }],
      ascent: 900,
      descent: -200,
    })),
    downloadProgram: vi.fn(async () => new Uint8Array([1, 2, 3])),
  };
  const ctx = createTestContext({
    id: 'fonts',
    measurer: options.measurer,
    doc: (options.local === false
      ? { fonts }
      : { [LOCAL_ENGINE_BRAND]: true, fonts }) as unknown as Partial<DocumentHandle>,
  });
  const api = ctx.connect(createFontsController(ctx));
  return {
    ctx,
    fonts,
    api,
    setList: (next: FontList) => {
      current = next;
    },
  };
}

const settle = () => new Promise((resolve) => setTimeout(resolve));

describe('the font list model', () => {
  it('reads the list again when the document says its fonts changed, and only then', () => {
    expect(foldFontList(LIST, fontsChanged)).toEqual(reload());
    expect(foldFontList(LIST, { type: 'pages.rotated', origin } as unknown as DocumentEvent)).toBe(
      LIST,
    );
  });

  it("finds a face's font by family, the closest weight first, an engine font before a standard one", () => {
    expect(fontForFace(LIST, { family: 'roboto', weight: 650 })).toBe(ROBOTO_BOLD);
    expect(fontForFace(LIST, { family: 'Roboto' })).toBe(ROBOTO);
    expect(fontForFace({ ...LIST, fonts: [ARIAL] }, { family: 'Arial' })).toBe(ARIAL);
    expect(fontForFace(LIST, { family: 'Arial' })).toBeUndefined();
  });

  it("names the fallbacks' programs in the list's order", () => {
    expect(fallbackHashes(LIST)).toEqual([hashOf('c')]);
    expect(fallbackHashes(null)).toEqual([]);
  });
});

describe('the fonts controller', () => {
  it('reads the list the first time something asks, once, and again when the fonts change', async () => {
    const { ctx, fonts, api } = harness();
    await settle();
    expect(fonts.list).not.toHaveBeenCalled();
    expect(api.getFontList()).toBeNull();

    const changed = vi.fn();
    api.onFontListChanged(changed);
    await api.ensureLoaded();
    await api.ensureLoaded();
    expect(fonts.list).toHaveBeenCalledTimes(1);
    expect(api.getFontList()).toBe(LIST);
    expect(changed).toHaveBeenCalledTimes(1);

    ctx.emitDocumentEvent(fontsChanged);
    await settle();
    expect(fonts.list).toHaveBeenCalledTimes(2);
  });

  it('draws a standard font in its built-in program without the list, then the last resort, then its look-alikes', () => {
    const { fonts, api } = harness();
    const css = api.getFontCss('helvetica-bold');
    expect(css.programs).toEqual([standardFontProgram('helvetica-bold'), lastResortFontProgram()]);
    expect(css.fontFamily).toBe(
      `"${standardFontProgram('helvetica-bold').family}", ` +
        `"${lastResortFontProgram().family}", Helvetica, Arial, sans-serif`,
    );
    expect(css).toMatchObject({ fontWeight: 700, fontStyle: 'normal' });
    expect(api.getFontCss('helvetica-bold')).toBe(css);
    expect(fonts.list).not.toHaveBeenCalled();
  });

  it("draws a document font in its own program, then the list's fallbacks, and loads it from the engine once", async () => {
    const { fonts, api } = harness();
    await api.ensureLoaded();
    const css = api.getFontCss('Roboto-Regular');
    expect(css.programs.map((mounted) => mounted.hash)).toEqual([
      hashOf('a'),
      hashOf('c'),
      LAST_RESORT_HASH,
    ]);
    expect(css.fontFamily.startsWith(`"epdf-${hashOf('a').slice(0, 16)}", "epdf-`)).toBe(true);
    // Before they're mounted: the look-alikes of the standard font of its face.
    expect(css.fontFamily.endsWith(', Helvetica, Arial, sans-serif')).toBe(true);

    await css.programs[0]!.load();
    await css.programs[0]!.load();
    expect(fonts.downloadProgram).toHaveBeenCalledTimes(1);
    expect(fonts.downloadProgram).toHaveBeenCalledWith(hashOf('a'));
  });

  it("finds a rich text face's program, and a face no font has in the engine's standard fallback", async () => {
    const { api } = harness();
    await api.ensureLoaded();
    expect(api.getFaceCss({ family: 'Roboto', weight: 700 }).programs[0]!.hash).toBe(hashOf('b'));
    expect(api.getFaceCss({ family: 'Courier New', weight: 700 }).programs[0]).toBe(
      standardFontProgram('courier-bold'),
    );
  });

  it('draws a font the list doesn’t name, or before the list is loaded, in Helvetica', () => {
    const { api } = harness();
    expect(api.getFontCss('brand-sans').programs[0]).toBe(standardFontProgram('helvetica'));
    expect(api.getFontCss('brand-sans').fontFamily).not.toContain('brand-sans');
  });

  it("draws a font whose program can't reach the browser in the standard font of its face", async () => {
    const { api } = harness();
    await api.ensureLoaded();
    expect(api.getFontCss('Minion').programs[0]).toBe(standardFontProgram('helvetica'));
  });

  it('draws a resolved run in the program and fallbacks the engine named', async () => {
    const { api } = harness();
    await api.ensureLoaded();
    const css = api.getRunCss({
      font: 'Roboto-Bold',
      weight: 700,
      italic: false,
      substituted: false,
      program: hashOf('b'),
      fallbacks: [hashOf('c')],
    });
    expect(css.programs.map((mounted) => mounted.hash)).toEqual([
      hashOf('b'),
      hashOf('c'),
      LAST_RESORT_HASH,
    ]);
    expect(css.programs[0]).toMatchObject({ weight: 700, style: 'normal' });
  });

  it('builds new CSS once the list changes', async () => {
    const { ctx, api, setList } = harness();
    await api.ensureLoaded();
    const before = api.getFontCss('Roboto-Regular');
    setList({ ...LIST, fallbacks: [] });
    ctx.emitDocumentEvent(fontsChanged);
    await settle();
    const after = api.getFontCss('Roboto-Regular');
    expect(after).not.toBe(before);
    expect(after.programs.map((mounted) => mounted.hash)).toEqual([hashOf('a'), LAST_RESORT_HASH]);
  });

  it("says which face a program's CSS family stands for, and nothing for any other family", async () => {
    const { api } = harness();
    await api.ensureLoaded();
    expect(api.getFaceOfCssFamily(standardFontProgram('times-bold').family)).toEqual({
      family: 'Times',
      weight: 700,
      italic: false,
    });
    expect(api.getFaceOfCssFamily(`epdf-${hashOf('b').slice(0, 16)}`)).toEqual({
      family: 'Roboto',
      weight: 700,
      italic: false,
    });
    expect(api.getFaceOfCssFamily(lastResortFontProgram().family)).toBeNull();
    expect(api.getFaceOfCssFamily('Helvetica')).toBeNull();
    expect(api.getFaceOfCssFamily('epdf-brand-sans')).toBeNull();
  });

  it('reads a program once for every caller', async () => {
    const { fonts, api } = harness();
    const [first, second] = await Promise.all([
      api.getProgram(hashOf('a')),
      api.getProgram(hashOf('a')),
    ]);
    expect(first).toEqual(second);
    expect(fonts.getProgram).toHaveBeenCalledTimes(1);
  });

  it('lists the fonts of a document on any engine, the cloud’s too', async () => {
    const { api, fonts } = harness({ local: false });
    await api.ensureLoaded();
    expect(fonts.list).toHaveBeenCalledTimes(1);
    await api.resolve({ runs: [] });
    expect(fonts.resolve).toHaveBeenCalledTimes(1);
    expect(api.getFontCss('times-roman').programs[0]).toBe(standardFontProgram('times-roman'));
  });
});

/**
 * A host whose programs are ready when `load()` says so, or refused when
 * `refuse()` does, and whose letters are 600 wide.
 */
function fakeMeasurer() {
  const listeners = new Set<() => void>();
  const loaded = new Set<string>();
  const refusedFamilies = new Set<string>();
  const asked: string[] = [];
  const measurer: HostTextMeasurer = {
    ready: (program: HostFontProgram) => {
      asked.push(program.family);
      return loaded.has(program.family);
    },
    refused: (program) => refusedFamilies.has(program.family),
    width: (_program, text) => [...text].length * 600,
    onChange(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
  const changed = () => {
    for (const listener of [...listeners]) listener();
  };
  return {
    measurer,
    asked,
    load(family: string) {
      loaded.add(family);
      changed();
    },
    refuse(family: string) {
      refusedFamilies.add(family);
      changed();
    },
  };
}

const HEBREW_FAMILY = fontProgramFamily(hashOf('c'));

describe("a box's paint fonts", () => {
  it('draws text its standard font has whole in it at once, without asking the engine', () => {
    const host = fakeMeasurer();
    const { fonts, api } = harness({ measurer: host.measurer });
    const plain = api.getPaintFonts('helvetica', 'Hello, “world”')!;
    expect(plain.face.key).toBe('helvetica');
    expect(plain.fallbacks).toEqual([]);
    expect(plain.lastResort?.key).toBe(LAST_RESORT_HASH);
    expect(api.getPaintFonts('helvetica', 'Bye')).toBe(plain);
    expect(fonts.resolve).not.toHaveBeenCalled();
  });

  it("finds the fallbacks for the box's style, then waits for the programs its text needs", async () => {
    const host = fakeMeasurer();
    const { fonts, api } = harness({ measurer: host.measurer });
    const epoch = api.getPaintFontsEpoch();
    expect(api.getPaintFonts('helvetica-bold', 'Hello שלום')).toBeNull();
    await settle();
    expect(fonts.resolve).toHaveBeenCalledWith({
      runs: [{ text: ' ', fontFamily: 'helvetica-bold' }],
    });
    expect(api.getPaintFontsEpoch()).toBeGreaterThan(epoch);
    // Found; the Hebrew program is asked for and loads.
    expect(api.getPaintFonts('helvetica-bold', 'Hello שלום')).toBeNull();
    expect(host.asked).toEqual([HEBREW_FAMILY]);
    const loading = api.getPaintFontsEpoch();
    host.load(HEBREW_FAMILY);
    expect(api.getPaintFontsEpoch()).toBeGreaterThan(loading);

    const found = api.getPaintFonts('helvetica-bold', 'Hello שלום')!;
    expect(found.face.key).toBe('helvetica-bold');
    expect(found.fallbacks.map((font) => [font.key, font.program.family])).toEqual([
      [hashOf('c'), HEBREW_FAMILY],
    ]);
    expect(found.fallbacks[0]!.covers(0x05e9)).toBe(true);
    expect(found.fallbacks[0]!.covers(0x0041)).toBe(false);
    expect(found.fallbacks[0]!.width('שלום', true)).toBe(2400);
    expect(found.fallbacks[0]).toMatchObject({ ascent: 900, descent: -200 });
    // The same fonts for any text in that box; text in Latin alone needs no program.
    expect(api.getPaintFonts('helvetica-bold', 'שלום עולם')).toBe(found);
    expect(fonts.resolve).toHaveBeenCalledTimes(1);
  });

  it("draws in a font's own program, or, when a browser can't get it, its face's standard font", async () => {
    const host = fakeMeasurer();
    host.load(fontProgramFamily(hashOf('a')));
    host.load(HEBREW_FAMILY);
    const { api } = harness({ measurer: host.measurer });
    api.getPaintFonts('Roboto-Regular', 'Hi שלום');
    api.getPaintFonts('Minion', 'Hi שלום');
    await settle();
    const roboto = api.getPaintFonts('Roboto-Regular', 'Hi שלום')!;
    expect(roboto.face).toMatchObject({
      key: hashOf('a'),
      standard: false,
      fontFamily: `"${fontProgramFamily(hashOf('a'))}"`,
      fontWeight: 400,
    });
    expect(roboto.face.width('Hi', false)).toBe(1200);
    expect(api.getPaintFonts('Minion', 'Hi שלום')!.face.key).toBe('helvetica');
  });

  it('names the programs once the host has them all: until then the look-alikes, never the last resort’s boxes', async () => {
    const host = fakeMeasurer();
    const { api } = harness({ measurer: host.measurer });
    await api.ensureLoaded();
    const loading = api.getFontCss('Roboto-Regular');
    expect(loading.fontFamily).toBe('Helvetica, Arial, sans-serif');
    // Asking loads every program it names: the consumer mounts them meanwhile.
    expect(host.asked).toEqual(loading.programs.map((program) => program.family));
    for (const program of loading.programs) host.load(program.family);
    const mounted = api.getFontCss('Roboto-Regular');
    expect(mounted.programs).toEqual(loading.programs);
    expect(mounted.fontFamily).toBe(
      `${loading.programs.map((program) => `"${program.family}"`).join(', ')}, Helvetica, Arial, sans-serif`,
    );
  });

  it("draws a program the browser refuses as one it can't get: the face's look-alike, no such fallback", async () => {
    const host = fakeMeasurer();
    const robotoFamily = fontProgramFamily(hashOf('a'));
    const { api } = harness({ measurer: host.measurer });
    await api.ensureLoaded();
    expect(api.getFontCss('Roboto-Regular').programs[0]!.family).toBe(robotoFamily);
    api.getPaintFonts('Roboto-Regular', 'Hi');
    await settle();
    expect(api.getPaintFonts('Roboto-Regular', 'Hi')).toBeNull();
    expect(host.asked).toContain(robotoFamily);

    const epoch = api.getPaintFontsEpoch();
    host.refuse(robotoFamily);
    host.refuse(HEBREW_FAMILY);
    expect(api.getPaintFontsEpoch()).toBeGreaterThan(epoch);
    // The editor's CSS starts with the face's standard look-alike, never the refused programs.
    const css = api.getFontCss('Roboto-Regular');
    expect(css.programs.map((program) => program.hash)).toEqual([
      standardFontProgram('helvetica').hash,
      LAST_RESORT_HASH,
    ]);
    // The painter draws in the look-alike, without waiting for a program that never comes.
    const fonts = api.getPaintFonts('Roboto-Regular', 'Hi שלום')!;
    expect(fonts.face.key).toBe('helvetica');
    expect(fonts.fallbacks).toEqual([]);
  });

  it("draws in the defaults where fonts can't be measured or found", async () => {
    const withoutMeasurer = harness();
    expect(withoutMeasurer.api.getPaintFonts('helvetica', 'שלום')!.fallbacks).toEqual([]);
    expect(withoutMeasurer.fonts.resolve).not.toHaveBeenCalled();

    const host = fakeMeasurer();
    const failing = harness({ measurer: host.measurer });
    failing.fonts.resolve.mockRejectedValueOnce(new Error('closed'));
    expect(failing.api.getPaintFonts('helvetica', 'שלום')).toBeNull();
    await settle();
    expect(failing.api.getPaintFonts('helvetica', 'שלום')!.fallbacks).toEqual([]);
  });

  it("finds them again once the document's fonts change", async () => {
    const host = fakeMeasurer();
    host.load(HEBREW_FAMILY);
    const { ctx, fonts, api, setList } = harness({ measurer: host.measurer });
    api.getPaintFonts('helvetica', 'שלום');
    await settle();
    expect(api.getPaintFonts('helvetica', 'שלום')!.fallbacks).toHaveLength(1);

    setList({ ...LIST, fallbacks: [] });
    const epoch = api.getPaintFontsEpoch();
    ctx.emitDocumentEvent(fontsChanged);
    await settle();
    expect(api.getPaintFontsEpoch()).toBeGreaterThan(epoch);
    // What was found draws on while they're found again: nothing waits on the picture.
    expect(api.getPaintFonts('helvetica', 'שלום')!.fallbacks).toHaveLength(1);
    await settle();
    expect(api.getPaintFonts('helvetica', 'שלום')!.fallbacks).toEqual([]);
    expect(fonts.resolve).toHaveBeenCalledTimes(2);
  });
});
