/**
 * `src/annotation/kind-facts.generated.ts` is what `scripts/generate-kind-facts.ts` writes from
 * the kind declarations as they are now. When a declaration changes, run
 * `pnpm --filter @embedpdf/engine-core generate`.
 */
import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { KIND_FACTS_FILE, renderKindFacts } from '../../scripts/generate-kind-facts';
import { kindFactsOf } from '../../src/annotation/kind-facts';

describe('kind-facts.generated.ts', () => {
  it('is fresh: what the generator writes from the declarations', () => {
    expect(
      readFileSync(KIND_FACTS_FILE, 'utf8') === renderKindFacts(),
      'out of date: run `pnpm --filter @embedpdf/engine-core generate`',
    ).toBe(true);
  });

  it('has no kind for a subtype no declaration names', () => {
    expect(kindFactsOf('toString')).toBeNull();
    expect(kindFactsOf('circle')?.owners.box).toBe('data');
  });
});
