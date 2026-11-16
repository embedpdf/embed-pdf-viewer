import { describe, expect, test } from 'vitest';

import { analysisQueryString } from '../../src/wire/paths';
import { decodeAnalysisToken, encodeAnalysisToken } from '../../src/wire/tokens';

const pin = { engine: '7a2e90c4', shape: 1 };
const token = { docVersion: 4, pin, since: { signatureIndex: 0 } } as const;

/**
 * What a signature allows after it is judged by rules that are a part of the server's
 * `analysis` engine value. An analysis URL names that value and no policy number.
 */
describe('analysis URLs', () => {
  test('a token names the engine value, and no policy number', () => {
    expect(encodeAnalysisToken(token)).toBe(
      'docVersion=4,engine=7a2e90c4,shape=1,since.signature=0',
    );
    expect(decodeAnalysisToken(encodeAnalysisToken(token))).toEqual(token);
    // A policy number handed over, as code written for 3.2 does, is not written.
    expect(encodeAnalysisToken({ ...token, policyVersion: 4 })).toBe(encodeAnalysisToken(token));
  });

  test('the token of a client of 3.0 to 3.2 still reads, its policy number unread', () => {
    for (const policy of ['4', '5', '99', 'none']) {
      expect(
        decodeAnalysisToken(
          `docVersion=4,engine=7a2e90c4,policy=${policy},shape=1,since.signature=0`,
        ),
      ).toEqual(token);
    }
  });

  test('a version query carries the engine value it is given, and never a policy number', () => {
    expect(analysisQueryString({ since: { signatureIndex: 0 }, engine: '7a2e90c4' })).toBe(
      'since.signature=0&engine=7a2e90c4',
    );
    expect(
      analysisQueryString({
        since: { revisionIndex: 2 },
        until: 5,
        exploratoryLevel: 'fill',
        detail: 'full',
      }),
    ).toBe('since.revision=2&until=5&level=fill&detail=full');
  });
});
