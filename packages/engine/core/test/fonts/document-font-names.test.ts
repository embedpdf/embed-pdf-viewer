import { describe, expect, test } from 'vitest';

import {
  documentFontNameOf,
  documentFontsOf,
  documentProgramForName,
  fontListOf,
  fontResolutionOf,
  type BuiltInPrograms,
  type DocumentFaceFacts,
  type FontProgramFacts,
} from '../../src/fonts/fontList';

const hashOf = (seed: string) => seed.repeat(64).slice(0, 64);

/** A whole TrueType program new text can be written in. */
const program = (over: Partial<FontProgramFacts> = {}): FontProgramFacts => ({
  objectNumber: 10,
  format: 'truetype',
  embedded: 'whole',
  postScriptName: null,
  permission: 'installable',
  mapsUnicode: true,
  sha256: hashOf('a'),
  displaySha256: hashOf('a'),
  ascent: 900,
  descent: 200,
  ...over,
});

/** A program a PDF draws with but holds no file for: a Type 3 font, as Chrome prints variable fonts. */
const drawnOnly = program({
  objectNumber: 0,
  format: 'type3',
  embedded: 'none',
  mapsUnicode: false,
  permission: null,
  sha256: null,
  displaySha256: null,
});

const face = (
  familyName: string,
  weight: number,
  programs: FontProgramFacts[],
  italic = false,
): DocumentFaceFacts => ({ familyName, weight, italic, programs });

const builtIn: BuiltInPrograms = {
  standardDisplayHash: (name) => hashOf(name.charAt(0)),
  lastResortDisplayHash: hashOf('z'),
};

const listNames = (faces: DocumentFaceFacts[]) =>
  fontListOf({ faces, engineFonts: [], fallbacks: [] }, builtIn)
    .fonts.filter((font) => font.source === 'document')
    .map((font) => font.name);

describe('a document font name', () => {
  const inter = { familyName: 'Inter', weight: 400, italic: false };

  test('is the PostScript name, which says the style', () => {
    expect(documentFontNameOf({ ...inter, weight: 500 }, 'Inter-Medium')).toBe('Inter-Medium');
  });

  test('else the family, with the weight and italic in a style suffix', () => {
    expect(documentFontNameOf(inter, null)).toBe('Inter');
    expect(documentFontNameOf({ ...inter, italic: true }, null)).toBe('Inter,Italic');
    expect(documentFontNameOf({ ...inter, weight: 700 }, null)).toBe('Inter,Bold');
    expect(documentFontNameOf({ ...inter, weight: 700, italic: true }, null)).toBe(
      'Inter,BoldItalic',
    );
    expect(documentFontNameOf({ ...inter, weight: 200 }, null)).toBe('Inter,ExtraLight');
    expect(documentFontNameOf({ ...inter, weight: 500, italic: true }, null)).toBe(
      'Inter,MediumItalic',
    );
    expect(documentFontNameOf({ ...inter, weight: 450 }, null)).toBe('Inter,450');
  });
});

describe('the document fonts: one per name', () => {
  test("a family's weights are told apart when no program names them", () => {
    const faces = [200, 400, 500, 700, 800].map((weight) => face('Inter', weight, [drawnOnly]));
    expect(listNames(faces)).toEqual([
      'Inter,ExtraLight',
      'Inter',
      'Inter,Medium',
      'Inter,Bold',
      'Inter,ExtraBold',
    ]);
  });

  test('copies of one font under one name are one font, however each editor described it', () => {
    // One editor wrote /FontFamily (Arial); the other didn't, so the name says Helvetica.
    const fonts = documentFontsOf([
      face('Arial', 400, [program({ objectNumber: 10, postScriptName: 'ArialMT' })]),
      face('Helvetica', 400, [program({ objectNumber: 11, postScriptName: 'ArialMT' })]),
      // One wrote /FontWeight 600; the other didn't, and "Bold" in the name says 700.
      face('Grotesk', 600, [program({ objectNumber: 12, postScriptName: 'Grotesk-SemiBold' })]),
      face('Grotesk', 700, [program({ objectNumber: 13, postScriptName: 'Grotesk-SemiBold' })]),
    ]);
    expect(fonts.map((font) => [font.name, font.programs.length])).toEqual([
      ['ArialMT', 2],
      ['Grotesk-SemiBold', 2],
    ]);
  });

  test('two fonts one face describes keep their own names', () => {
    // Neither font dictionary has /FontWeight, and "Thin" isn't a weight the name is read for.
    const faces = [
      face('Roboto', 400, [
        program({ objectNumber: 10, postScriptName: 'Roboto-Regular' }),
        program({ objectNumber: 11, postScriptName: 'Roboto-Thin', sha256: hashOf('b') }),
      ]),
    ];
    expect(listNames(faces)).toEqual(['Roboto-Regular', 'Roboto-Thin']);
    const facts = { faces, engineFonts: [], fallbacks: [] };
    expect(documentProgramForName(facts, 'Roboto-Thin')).toMatchObject({
      objectNumber: 11,
      choosable: true,
    });
    const resolved = fontResolutionOf(
      [
        {
          source: 'document-program',
          engineFont: null,
          objectNumber: 11,
          baseFontName: 'Roboto-Thin',
          familyName: 'Roboto',
          weight: 400,
          italic: false,
          degraded: false,
          fallbacks: [],
        },
      ],
      [],
      facts,
      builtIn,
    );
    expect(resolved.runs[0]!.font).toBe('Roboto-Thin');
  });

  test('is described by the face of the program new text uses first', () => {
    const [font] = documentFontsOf([
      face('Grotesk', 700, [
        program({ objectNumber: 10, postScriptName: 'Grotesk-SemiBold', embedded: 'subset' }),
      ]),
      face('Grotesk', 600, [program({ objectNumber: 11, postScriptName: 'Grotesk-SemiBold' })]),
    ]);
    expect(font!.face).toEqual({ familyName: 'Grotesk', weight: 600, italic: false });
    expect(font!.programs.map((found) => found.objectNumber)).toEqual([11, 10]);
  });

  test('holds one stream two dictionaries read differently as two programs', () => {
    // A bare CFF program two Type 1 dictionaries give other widths: two display programs.
    const cff = {
      format: 'cff' as const,
      mapsUnicode: false,
      permission: null,
      postScriptName: 'FoxitFixed',
    };
    const [font] = documentFontsOf([
      face('FoxitFixed', 400, [
        program({ ...cff, objectNumber: 4, displaySha256: hashOf('n') }),
        program({ ...cff, objectNumber: 4, displaySha256: hashOf('w') }),
      ]),
    ]);
    expect(font!.programs.map((found) => found.displaySha256)).toEqual([hashOf('n'), hashOf('w')]);
  });

  test('holds a program found under two faces once', () => {
    const shared = program({ objectNumber: 10, postScriptName: 'Lato-Regular' });
    const [font] = documentFontsOf([face('Lato', 400, [shared]), face('Lato', 500, [shared])]);
    expect(font!.programs).toEqual([shared]);
  });

  test('leaves out a program with neither a PostScript name nor a family', () => {
    expect(documentFontsOf([face('', 400, [drawnOnly])])).toEqual([]);
    expect(
      documentFontsOf([face('', 400, [program({ postScriptName: 'Brand-Sans' })])]).map(
        (font) => font.name,
      ),
    ).toEqual(['Brand-Sans']);
  });
});
