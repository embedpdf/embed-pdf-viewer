import { describe, expect, test } from 'vitest';
import { decodedLengthOf, fromBase64, toBase64 } from '../../src/resource/base64';

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

describe('toBase64', () => {
  test.each([
    [[], ''],
    [[102], 'Zg=='],
    [[102, 111], 'Zm8='],
    [[102, 111, 111], 'Zm9v'],
    [[251, 255, 0], '+/8A'],
  ] as const)('encodes %j', (bytes, encoded) => {
    expect(toBase64(Uint8Array.from(bytes))).toBe(encoded);
  });

  test('round-trips every byte value at every length modulo three', () => {
    const bytes = Uint8Array.from({ length: 3 * 256 + 2 }, (_, i) => (i * 7) & 0xff);
    for (const length of [bytes.length - 2, bytes.length - 1, bytes.length]) {
      const slice = bytes.subarray(0, length);
      expect(fromBase64(toBase64(slice))).toEqual(slice);
    }
  });
});

describe('decodedLengthOf', () => {
  test('is the length fromBase64 returns, without decoding', () => {
    for (const encoded of ['', 'Zg==', 'Zg', 'Zm8=', 'Zm8', 'Zm9v', 'Zm9vYg==']) {
      expect(decodedLengthOf(encoded)).toBe(fromBase64(encoded).length);
    }
  });

  test('is null for a length base64 cannot have', () => {
    expect(decodedLengthOf('A')).toBeNull();
    expect(decodedLengthOf('AAAAA==')).toBeNull();
  });
});
