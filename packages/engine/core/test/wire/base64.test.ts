import { describe, expect, test } from 'vitest';
import { fromBase64 } from '../../src/wire';

describe('fromBase64', () => {
  test.each([
    ['', []],
    ['Zg==', [102]],
    ['Zg', [102]],
    ['Zm8=', [102, 111]],
    ['Zm8', [102, 111]],
    ['Zm9v', [102, 111, 111]],
    ['+/8A', [251, 255, 0]],
  ] as const)('decodes %j', (encoded, bytes) => {
    expect(fromBase64(encoded)).toEqual(Uint8Array.from(bytes));
  });

  test('preserves support for arbitrary trailing padding', () => {
    const padding = '='.repeat(100_000);
    expect(fromBase64(padding)).toEqual(new Uint8Array());
    expect(fromBase64(`Zg${padding}`)).toEqual(Uint8Array.of(102));
  });

  test.each(['A', 'AAAAA', 'Zg=Zg', 'Z g==', 'Zg==\n', 'Zg-_'])(
    'rejects malformed input %j',
    (encoded) => {
      expect(() => fromBase64(encoded)).toThrow('malformed base64');
    },
  );

  test.each(['A', 'A=='])('rejects long interior padding followed by %j', (suffix) => {
    // The former unanchored /=+$/ expression retried the entire run at each '='.
    const encoded = `Zg${'='.repeat(100_000)}${suffix}`;
    expect(() => fromBase64(encoded)).toThrow('malformed base64');
  });
});
