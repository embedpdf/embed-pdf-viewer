/**
 * Every worker registers the fonts the engine comes with after the
 * deployment's own: their files, from `@embedpdf/default-fallback-fonts`.
 */
import { existsSync } from 'node:fs';

import { FALLBACK_TIERS } from '@embedpdf/engine-core/runtime';
import { describe, expect, test } from 'vitest';

import { defaultFallbackFontSpecs } from '../src/runtime/defaultFallbackFonts';

describe('the default fallback fonts on the server', () => {
  test('are the package’s files, in the built-in tier', () => {
    const specs = defaultFallbackFontSpecs(new Set());
    expect(specs.map((spec) => spec.key)).toEqual([
      'noto-sans-hebrew',
      'noto-sans-hebrew-bold',
      'noto-naskh-arabic',
      'noto-naskh-arabic-bold',
    ]);
    for (const spec of specs) {
      expect(existsSync(spec.path)).toBe(true);
      expect(spec).toMatchObject({ fallback: true, tier: FALLBACK_TIERS.builtIn });
    }
  });

  test('leave out a key the deployment uses', () => {
    const specs = defaultFallbackFontSpecs(new Set(['noto-sans-hebrew']));
    expect(specs.map((spec) => spec.key)).not.toContain('noto-sans-hebrew');
    expect(specs).toHaveLength(3);
  });
});
