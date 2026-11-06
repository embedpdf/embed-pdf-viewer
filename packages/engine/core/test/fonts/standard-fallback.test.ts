import { describe, expect, test } from 'vitest';

import { standardFontForFace } from '../../src/annotation/fontFaces';
import {
  fontResolutionOf,
  type BuiltInPrograms,
  type FontListFacts,
  type ResolvedRunFacts,
} from '../../src/fonts/fontList';

const hashOf = (seed: string) => seed.repeat(64).slice(0, 64);

const builtIn: BuiltInPrograms = {
  standardDisplayHash: (name) => hashOf(`s-${name}-`),
  lastResortDisplayHash: hashOf('z'),
};

const facts: FontListFacts = {
  faces: [],
  engineFonts: [
    {
      key: 'noto-sans-hebrew',
      identity: {
        familyName: 'Noto Sans Hebrew',
        weight: 400,
        italic: false,
        embeddingPermission: 'installable',
        editingAuthorized: true,
        instanced: false,
      },
      postScriptName: 'NotoSansHebrew',
      format: 'truetype',
      sha256: hashOf('h'),
      served: true,
      builtIn: true,
    },
  ],
  fallbacks: ['noto-sans-hebrew'],
};

const run = (over: Partial<ResolvedRunFacts>): ResolvedRunFacts => ({
  source: 'engine',
  engineFont: 'noto-sans-hebrew',
  objectNumber: 0,
  displaySha256: null,
  baseFontName: null,
  familyName: 'Noto Sans Hebrew',
  weight: 400,
  italic: false,
  degraded: false,
  fallbacks: ['noto-sans-hebrew'],
  ...over,
});

describe('the standard font that stands in for a face', () => {
  test('is its own standard family, else Helvetica, in its weight and italic', () => {
    expect(standardFontForFace({ family: 'Arial', weight: 700 })).toBe('helvetica-bold');
    expect(standardFontForFace({ family: 'Times New Roman', italic: true })).toBe('times-italic');
    expect(standardFontForFace({ family: 'Nowhere Sans' })).toBe('helvetica');
    expect(standardFontForFace({ family: 'Noto Sans Hebrew', weight: 700, italic: true })).toBe(
      'helvetica-bold-oblique',
    );
  });
});

describe('a resolved run', () => {
  test("ends its fallbacks with the standard font for its face's style", () => {
    const { runs } = fontResolutionOf([run({})], [], facts, builtIn);
    expect(runs[0]!.fallbacks).toEqual([hashOf('h'), builtIn.standardDisplayHash('helvetica')]);

    const bold = fontResolutionOf([run({ weight: 700 })], [], facts, builtIn);
    expect(bold.runs[0]!.fallbacks.at(-1)).toBe(builtIn.standardDisplayHash('helvetica-bold'));
  });

  test('drawn in that standard font, lists no fallback for it', () => {
    const { runs } = fontResolutionOf(
      [
        run({
          source: 'standard',
          engineFont: null,
          baseFontName: 'Helvetica',
          familyName: 'Helvetica',
        }),
      ],
      [],
      facts,
      builtIn,
    );
    expect(runs[0]!.program).toBe(builtIn.standardDisplayHash('helvetica'));
    expect(runs[0]!.fallbacks).toEqual([hashOf('h')]);
  });
});
