import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { devWarn, resetDevWarnings } from '../src/dev';

/** The development guardrails: each warning fires once. */

let warn: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  resetDevWarnings();
  warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => {
  warn.mockRestore();
});

describe('devWarn', () => {
  it('fires once per key', () => {
    devWarn('k', 'first');
    devWarn('k', 'second');
    devWarn('other', 'third');
    expect(warn.mock.calls.map((call) => call[0])).toEqual(['[embedpdf] first', '[embedpdf] third']);
  });
});
