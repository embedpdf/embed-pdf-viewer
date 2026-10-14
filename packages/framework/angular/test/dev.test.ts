/** The development guardrails: each warning fires once. */
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import { devWarn, resetDevWarnings } from '@embedpdf/angular/runtime';

let warn: MockInstance<(...data: unknown[]) => void>;
beforeEach(() => {
  resetDevWarnings();
  warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => warn.mockRestore());

describe('devWarn', () => {
  it('fires once per key', () => {
    devWarn('key', 'first');
    devWarn('key', 'second');
    devWarn('other', 'third');
    expect(warn.mock.calls.map((call) => call[0])).toEqual([
      '[embedpdf] first',
      '[embedpdf] third',
    ]);
  });
});
