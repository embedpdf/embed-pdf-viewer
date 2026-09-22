import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import type { Engine, SearchMatch, SearchQuery } from '@embedpdf/engine-core/runtime';
import { createLocalEngine } from '../src/index';

const here = dirname(fileURLToPath(import.meta.url));
// Authored in-repo by fixtures/generate-letter-spaced-fixture.mjs (see fixtures/README.md).
// Two pages: letter-spaced "i n v o i c e" (twice, once per page), a tracked-out invoice
// heading, a mixed-case "I n v o i c e", a plain "Invoice 42", glued "totalamount" next to
// spaced "total amount", "in" / "voice" split across a line break, and "the invoices".
const fixturePath = resolve(here, 'fixtures', 'letter_spaced_text.pdf');

/** The matched text exactly as the page carries it (snippet, 'full' mode). */
function hitText(m: SearchMatch): string {
  const s = m.snippet!;
  return s.text.slice(s.matchStart, s.matchStart + s.matchLength);
}

/** Case-folded, whitespace-free form — the identity the flag matches on. */
function squash(text: string): string {
  return text.replace(/\s+/g, '').toLowerCase();
}

const key = (m: SearchMatch) => `${m.page.pageObjectNumber}:${m.charStart}:${m.charCount}`;

describe('ignoreWhitespace against real page text (engine-local, wasm runtime)', () => {
  let engine: Engine;
  let bytes: Uint8Array;

  beforeAll(async () => {
    engine = await createLocalEngine({ runtime: { prefer: 'wasm' } });
    bytes = new Uint8Array(await readFile(fixturePath));
  });

  afterAll(async () => {
    if (engine) await engine.destroy();
  });

  async function search(query: SearchQuery): Promise<SearchMatch[]> {
    const doc = await engine.open({ kind: 'bytes', id: 'letter-spaced', bytes });
    try {
      const matches: SearchMatch[] = [];
      let cursor: string | undefined;
      for (;;) {
        const slice = await doc.search.query({ query, cursor });
        matches.push(...slice.matches);
        if (slice.nextCursor === null) return matches;
        cursor = slice.nextCursor;
      }
    } finally {
      await doc.close();
    }
  }

  test('the default fold does not see letter-spaced text', async () => {
    const hits = await search({ text: 'invoice' });
    expect(hits.length).toBeGreaterThan(0);
    for (const m of hits) expect(hitText(m)).not.toMatch(/\s/);
  });

  test('ignoreWhitespace finds the letter-spaced hits on both pages and keeps every default hit', async () => {
    const plain = await search({ text: 'invoice' });
    const relaxed = await search({ text: 'invoice', ignoreWhitespace: true });

    const relaxedKeys = new Set(relaxed.map(key));
    for (const m of plain) expect(relaxedKeys.has(key(m))).toBe(true);
    expect(relaxed.length).toBeGreaterThan(plain.length);

    const texts = relaxed.map(hitText);
    // The letter-spaced occurrences, one per page — the hit spans the gaps.
    expect(texts.filter((t) => t === 'i n v o i c e')).toHaveLength(2);
    expect(new Set(relaxed.map((m) => m.page.pageObjectNumber)).size).toBe(2);
    // The word split across a line break.
    expect(texts.some((t) => /^in\s+voice$/.test(t))).toBe(true);
    // Every hit is the same word once whitespace and case are dropped.
    for (const t of texts) expect(squash(t)).toMatch(/^invoices?$/);
    // Every hit carries drawable geometry, including the ones spanning gaps.
    for (const m of relaxed) expect(m.segments.length).toBeGreaterThan(0);
  });

  test('a spaced needle finds the glued word', async () => {
    const plain = (await search({ text: 'total amount' })).map(hitText);
    expect(plain).not.toContain('totalamount');

    const relaxed = (await search({ text: 'total amount', ignoreWhitespace: true })).map(hitText);
    expect(relaxed).toContain('totalamount');
    expect(relaxed).toContain('total amount');
    for (const t of relaxed) expect(squash(t)).toBe('totalamount');
  });

  test('wholeWord boundaries come from the original text', async () => {
    const relaxed = await search({ text: 'invoice', ignoreWhitespace: true });
    const whole = await search({ text: 'invoice', ignoreWhitespace: true, wholeWord: true });

    // "the invoices" is the only hit glued to a word character in the original
    // text (the snippet continues with the trailing "s").
    const gluedToWordCharacter = (m: SearchMatch) => {
      const s = m.snippet!;
      return /[\p{L}\p{N}]/u.test(s.text.charAt(s.matchStart + s.matchLength));
    };
    expect(relaxed.filter(gluedToWordCharacter)).toHaveLength(1);
    expect(whole.filter(gluedToWordCharacter)).toHaveLength(0);
    expect(whole.length).toBe(relaxed.length - 1);
    // "i n v o i c e 42": the digits are glued only on the folded plane.
    expect(whole.map(hitText).filter((t) => t === 'i n v o i c e')).toHaveLength(2);
  });

  test('matchCase composes with ignoreWhitespace', async () => {
    const lower = await search({ text: 'invoice', ignoreWhitespace: true, matchCase: true });
    expect(lower.length).toBeGreaterThan(0);
    for (const m of lower) expect(hitText(m)).toBe(hitText(m).toLowerCase());

    const capitalised = await search({ text: 'Invoice', ignoreWhitespace: true, matchCase: true });
    expect(capitalised.map(hitText)).toContain('Invoice');
    expect(capitalised.map(hitText)).toContain('I n v o i c e');
    for (const m of capitalised) expect(hitText(m).startsWith('I')).toBe(true);
  });
});
