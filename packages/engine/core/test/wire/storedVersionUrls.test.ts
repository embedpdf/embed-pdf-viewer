import { describe, expect, test } from 'vitest';

import { wirePaths } from '../../src/wire/paths';

/**
 * A stored version never changes, so its reads have no token. The two that are computed name
 * the engine value in the query instead.
 */
describe('reads of a stored version', () => {
  test('the signature list carries the engine value it is given', () => {
    expect(wirePaths.layerVersionSignatures('doc_1', 'alice', 'abc')).toBe(
      '/v1/docs/doc_1/layers/alice/versions/signatures/abc',
    );
    expect(wirePaths.layerVersionSignatures('doc_1', 'alice', 'abc', '51d3fe08')).toBe(
      '/v1/docs/doc_1/layers/alice/versions/signatures/abc?engine=51d3fe08',
    );
  });

  test('the analysis carries it too, after what was asked', () => {
    expect(
      wirePaths.layerVersionAnalysis('doc_1', 'alice', 'abc', {
        since: { signatureIndex: 0 },
        engine: '7a2e90c4',
      }),
    ).toBe('/v1/docs/doc_1/layers/alice/versions/analysis/abc?since.signature=0&engine=7a2e90c4');
  });
});
