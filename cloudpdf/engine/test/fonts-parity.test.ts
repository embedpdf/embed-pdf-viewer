import { describe, expect, test } from 'vitest';

import { cloudEngine } from '../src/index';

/**
 * The local-vs-cloud font split is a deliberate product decision: fallback
 * fonts are a server-side policy on the cloud engine, so clients cannot
 * configure them. `Engine.fonts` is optional precisely so the cloud engine can
 * omit it. This locks that in — if someone adds a `fonts` service to
 * CloudEngine, this fails.
 */
describe('cloud engine font parity', () => {
  test('does not expose a fonts service', () => {
    const engine = cloudEngine({ baseUrl: 'http://localhost' });
    expect(engine.fonts).toBeUndefined();
  });
});
