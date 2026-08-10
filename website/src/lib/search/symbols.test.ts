import { performance } from 'node:perf_hooks';

import { describe, expect, it } from 'vitest';

import { symbolsFromCode } from './symbols';

describe('identifier extraction', () => {
  it('extracts PascalCase and underscore-shaped symbols', () => {
    const symbols = symbolsFromCode('const client: CloudPDFClient = EPDFForm_GetValue;');

    expect(symbols).toContain('CloudPDFClient');
    expect(symbols).toContain('EPDFForm_GetValue');
  });

  it('handles an adversarial uppercase non-match in linear time', () => {
    // The former nested repetition backtracked exponentially on this shape.
    // Keep the input small enough that a regression finishes, but large enough
    // to distinguish the linear matcher by orders of magnitude.
    const source = `Aa${'A'.repeat(26)}_`;
    const started = performance.now();

    symbolsFromCode(source);

    expect(performance.now() - started).toBeLessThan(100);
  });
});
