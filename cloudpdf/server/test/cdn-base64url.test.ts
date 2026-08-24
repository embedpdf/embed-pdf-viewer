import { describe, expect, test } from 'vitest';
import { randomBytes } from 'node:crypto';
import { base64url, cloudfrontBase64 } from '../src/cdn/util/base64url';

describe('base64url', () => {
  test('known vectors across all three padding cases', () => {
    // 3 bytes -> no padding, 2 bytes -> one '=', 1 byte -> two '='.
    expect(base64url(Buffer.from('abc', 'utf8'))).toBe('YWJj');
    expect(base64url(Buffer.from('ab', 'utf8'))).toBe('YWI');
    expect(base64url(Buffer.from('a', 'utf8'))).toBe('YQ');
    expect(base64url(Buffer.alloc(0))).toBe('');
  });

  test('uses the URL-safe alphabet with no padding', () => {
    // 0xfb 0xef 0xbe encodes to '++++' in standard base64.
    expect(base64url(Buffer.from([0xfb, 0xef, 0xbe]))).toBe('----');
    // 0xff 0xff 0xff encodes to '////'.
    expect(base64url(Buffer.from([0xff, 0xff, 0xff]))).toBe('____');
    for (let len = 0; len < 64; len++) {
      const out = base64url(randomBytes(len));
      expect(out).toMatch(/^[A-Za-z0-9_-]*$/);
    }
  });

  test('matches the historical replace-chain implementation byte for byte', () => {
    const legacy = (bytes: Buffer): string =>
      bytes.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    for (let len = 0; len < 200; len++) {
      const bytes = randomBytes(len);
      expect(base64url(bytes)).toBe(legacy(bytes));
    }
  });
});

describe('cloudfrontBase64', () => {
  test('applies the AWS CloudFront substitutions including padding', () => {
    expect(cloudfrontBase64(Buffer.from('a', 'utf8'))).toBe('YQ__');
    expect(cloudfrontBase64(Buffer.from([0xfb, 0xef, 0xbe]))).toBe('----');
    expect(cloudfrontBase64(Buffer.from([0xff, 0xff, 0xff]))).toBe('~~~~');
  });
});
