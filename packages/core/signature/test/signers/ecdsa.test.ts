import { EngineErrorCode } from '@embedpdf/engine-core/runtime';
import { describe, expect, test } from 'vitest';

import { cmsSignatureValue } from '../../src/cms/build';
import { ecdsaRawFromDer } from '../../src/index';

describe('an ECDSA signature from DER', () => {
  test('a signature WebCrypto made, turned into DER and back, still verifies', async () => {
    const keys = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, false, [
      'sign',
      'verify',
    ]);
    const data = new TextEncoder().encode('signed attributes');
    const algorithm = { name: 'ECDSA', hash: 'SHA-256' };
    for (let round = 0; round < 8; round++) {
      const raw = new Uint8Array(await crypto.subtle.sign(algorithm, keys.privateKey, data));
      const der = new Uint8Array(cmsSignatureValue('ECDSA', raw));

      const back = ecdsaRawFromDer(der, 'P-256');
      expect(Array.from(back)).toEqual(Array.from(raw));
      const checked = await crypto.subtle.verify(
        algorithm,
        keys.publicKey,
        new Uint8Array(back),
        data,
      );
      expect(checked).toBe(true);
    }
  });

  test('numbers are padded to the size of the curve, and leading zeros are dropped', () => {
    // sequence { integer 0x00 0x80 (a leading zero for the sign bit), integer 0x05 }
    const der = new Uint8Array([0x30, 0x07, 0x02, 0x02, 0x00, 0x80, 0x02, 0x01, 0x05]);
    for (const [curve, size] of [
      ['P-256', 32],
      ['P-384', 48],
      ['P-521', 66],
    ] as const) {
      const raw = ecdsaRawFromDer(der, curve);
      expect(raw).toHaveLength(size * 2);
      expect(raw[size - 1]).toBe(0x80);
      expect(raw[size * 2 - 1]).toBe(0x05);
      expect(raw.filter((octet) => octet !== 0)).toHaveLength(2);
    }
  });

  test('what is not such a signature is refused', () => {
    const refused = { code: EngineErrorCode.InvalidArg, details: { field: 'der' } };
    // A raw signature handed in where DER is expected.
    expect(() => ecdsaRawFromDer(new Uint8Array(64).fill(7), 'P-256')).toThrow(
      expect.objectContaining(refused),
    );
    // One integer only.
    expect(() => ecdsaRawFromDer(new Uint8Array([0x30, 0x03, 0x02, 0x01, 0x05]), 'P-256')).toThrow(
      expect.objectContaining(refused),
    );
    // A number too large for the curve.
    const large = new Uint8Array([
      0x30,
      0x26,
      0x02,
      0x21,
      ...new Uint8Array(33).fill(1),
      0x02,
      0x01,
      0x05,
    ]);
    expect(() => ecdsaRawFromDer(large, 'P-256')).toThrow(expect.objectContaining(refused));
    expect(() => ecdsaRawFromDer(new Uint8Array(), 'P-256')).toThrow(
      expect.objectContaining(refused),
    );
  });
});
