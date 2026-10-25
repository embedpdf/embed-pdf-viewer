import { describe, expect, test } from 'vitest';

import {
  documentFontNameOf,
  type DocumentFaceFacts,
  type FontProgramFacts,
} from '../../src/fonts/fontList';

/** A program a PDF draws with but holds no file for: a Type 3 font, as Chrome prints variable fonts. */
const drawnOnly: FontProgramFacts = {
  objectNumber: 0,
  format: 'type3',
  embedded: 'none',
  postScriptName: null,
  permission: null,
  mapsUnicode: false,
  sha256: null,
  displaySha256: null,
  ascent: 0,
  descent: 0,
};

const face = (weight: number, italic = false, program = drawnOnly): DocumentFaceFacts => ({
  familyName: 'Inter',
  weight,
  italic,
  programs: [program],
});

describe('a document font name', () => {
  test('is the PostScript name, which says the style', () => {
    expect(
      documentFontNameOf(face(500, false, { ...drawnOnly, postScriptName: 'Inter-Medium' })),
    ).toBe('Inter-Medium');
  });

  test('else the family, with the weight and italic in a style suffix', () => {
    expect(documentFontNameOf(face(400))).toBe('Inter');
    expect(documentFontNameOf(face(400, true))).toBe('Inter,Italic');
    expect(documentFontNameOf(face(700))).toBe('Inter,Bold');
    expect(documentFontNameOf(face(700, true))).toBe('Inter,BoldItalic');
    expect(documentFontNameOf(face(200))).toBe('Inter,ExtraLight');
    expect(documentFontNameOf(face(500, true))).toBe('Inter,MediumItalic');
    expect(documentFontNameOf(face(450))).toBe('Inter,450');
  });

  test("a family's weights are told apart", () => {
    const names = [200, 400, 500, 700, 800].map((weight) => documentFontNameOf(face(weight)));
    expect(names).toEqual([
      'Inter,ExtraLight',
      'Inter',
      'Inter,Medium',
      'Inter,Bold',
      'Inter,ExtraBold',
    ]);
  });
});
