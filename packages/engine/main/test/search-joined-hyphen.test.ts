import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import type { Engine, SearchMatch } from '@embedpdf/engine-core/runtime';
import { createLocalEngine } from '../src/index';

const here = dirname(fileURLToPath(import.meta.url));
// See fixtures/README.md: one page whose prose quotes the phrase below twice, then sets it
// with "containers" split over two lines, "con-" / "tainers", which PDFium joins into one
// word with `U+FFFE` for the hyphen.
const fixturePath = resolve(here, 'fixtures', 'search_cross_run_bug.pdf');

const PHRASE = 'combination locks of the containers concerned';

describe('a word joined across a line-end hyphen (engine-local, wasm runtime)', () => {
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
    const doc = await engine.open({ kind: 'bytes', id: 'joined-hyphen', bytes });
    try {
      const matches: SearchMatch[] = [];
      let cursor: string | undefined;
      for (;;) {
        const slice = await doc.search.query({ text, snippets: true, cursor });
        matches.push(...slice.matches);
        if (slice.nextCursor === null) return matches;
        cursor = slice.nextCursor;
      }
    } finally {
      await doc.close();
    }
  }

  test('search finds the phrase where its word is split, as well as where it is quoted', async () => {
    const matches = await search(PHRASE);
    expect(matches).toHaveLength(3);
    const split = matches.find((m) => m.snippet!.after.startsWith(' must be kept safely'));
    expect(split?.snippet!.match).toBe(PHRASE);
    // The hit covers the hyphen's character too: one more character than text.
    expect(split!.count).toBe(PHRASE.length + 1);
    expect(split!.segments.length).toBeGreaterThan(0);
  });

  test('the page text reads the word whole, and copying the hit gives the phrase', async () => {
    // Only the split occurrence goes on with "must".
    const matches = await search(`${PHRASE} must`);
    expect(matches).toHaveLength(1);
    const [split] = matches;
    const doc = await engine.open({ kind: 'bytes', id: 'joined-hyphen-text', bytes });
    try {
      const page = doc.page(split!.page);
      const { text } = await page.text.get();
      expect(text).not.toContain('￾');
      expect(text).not.toContain('\r');
      expect(text).toContain(`${PHRASE} must be kept safely`);
      expect(await page.text.slice(split!)).toBe(`${PHRASE} must`);
    } finally {
      await doc.close();
    }
  });
});
