import { reload, type DocumentEvent, type DocumentHandle } from '@embedpdf/core';
import { createTestContext, LOCAL_ENGINE_BRAND } from '@embedpdf/core/testing';
import { LAST_RESORT_HASH, lastResortFontProgram, standardFontProgram } from '@embedpdf/core-fonts';
import type { Font, FontList, FontProgram } from '@embedpdf/engine-core/runtime';
import { describe, expect, it, vi } from 'vitest';

import { createFontsController } from '../src/controller';
import { fallbackHashes, fontForFace, foldFontList, standardFontForFace } from '../src/model';

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

function harness(options: { local?: boolean; list?: FontList } = {}) {
  let current = options.list ?? LIST;
  const fonts = {
    list: vi.fn(async () => current),
    resolve: vi.fn(async () => ({ runs: [], missingCharacters: [] })),
    getProgram: vi.fn(async (hash: string) => ({
      ...program(hash),
      covers: [{ start: 32, count: 95 }],
      ascent: 900,
      descent: -200,
    })),
    downloadProgram: vi.fn(async () => new Uint8Array([1, 2, 3])),
  };
  const ctx = createTestContext({
    id: 'fonts',
    doc: (options.local === false
      ? {}
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

  it('draws a face no font has in its standard family, else Helvetica, in its style', () => {
    expect(standardFontForFace({ family: 'Arial', weight: 700 })).toBe('helvetica-bold');
    expect(standardFontForFace({ family: 'Times New Roman', italic: true })).toBe('times-italic');
    expect(standardFontForFace({ family: 'Nowhere Sans' })).toBe('helvetica');
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
    expect(css.fontFamily.endsWith('sans-serif')).toBe(true);

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

  it("refuses to list a document whose engine doesn't, and still draws the standard fonts", async () => {
    const { api } = harness({ local: false });
    await expect(api.ensureLoaded()).rejects.toMatchObject({ code: 'unsupported' });
    await expect(api.resolve({ runs: [] })).rejects.toMatchObject({ code: 'unsupported' });
    expect(api.getFontCss('times-roman').programs[0]).toBe(standardFontProgram('times-roman'));
  });
});
