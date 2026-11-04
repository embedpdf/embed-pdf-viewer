import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import type { Engine, SearchMatch } from '@embedpdf/engine-core/runtime';
import { createLocalEngine } from '../src/index';

const here = dirname(fileURLToPath(import.meta.url));
// Fixture from GitHub issue #848: a one-page PDF where the word "containers"
// is stored as two adjacent text runs because of a column-layout line-break
// hyphen ("con-" / "tainers").
const fixturePath = resolve(here, 'fixtures', 'search_cross_run_bug.pdf');

describe('cross-run hyphenation search (engine-local, wasm runtime)', () => {
  let engine: Engine;
  let bytes: Uint8Array;

  beforeAll(async () => {
    engine = await createLocalEngine({ runtime: { prefer: 'wasm' } });
    bytes = new Uint8Array(await readFile(fixturePath));
  });

  afterAll(async () => {
    if (engine) await engine.destroy();
  });

  async function search(text: string): Promise<SearchMatch[]> {
    const doc = await engine.open({ kind: 'bytes', id: 'cross-run', bytes });
    try {
      const matches: SearchMatch[] = [];
      let cursor: string | undefined;
      for (;;) {
        const slice = await doc.search.query({ query: { text } });
        matches.push(...slice.matches);
        cursor = slice.nextCursor ?? undefined;
        if (cursor === undefined) return matches;
      }
    } finally {
      await doc.close();
    }
  }

  test('finds the full phrase that spans the line-break hyphen', async () => {
    const matches = await search('combination locks of the containers concerned');
    expect(matches).toHaveLength(1);
    expect(matches[0].segments.length).toBeGreaterThan(0);
  });

  test('finds "containers" which is split by the hyphen', async () => {
    const matches = await search('containers');
    expect(matches.length).toBeGreaterThan(0);
  });

  test('does not break normal (non-hyphenated) searches', async () => {
    const matches = await search('combination locks');
    expect(matches.length).toBeGreaterThan(0);
  });
});
