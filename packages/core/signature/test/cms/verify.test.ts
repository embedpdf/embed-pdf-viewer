import { describe, expect, test } from 'vitest';

import { OID } from '../../src/cms/oids';
import { verifyCmsSignature } from '../../src/cms/verify';
import { verifyForCompletion } from '../../src/index';
import { createIdentity } from '../helpers/pki';
import { buildTestSignature } from '../helpers/tokens';

const digest = new Uint8Array(32).map((_, i) => (i * 7 + 3) & 0xff);

describe("a signature's certificate binding", () => {
  test('SHA-1, SHA-384 and SHA-512 bindings are checked like SHA-256', async () => {
    const signer = await createIdentity({ commonName: 'signer', ca: true });
    for (const binding of [
      { version: 1 },
      { version: 2, hashOid: OID.sha384 },
      { version: 2, hashOid: OID.sha512 },
    ] as const) {
      const good = await buildTestSignature({ digest, signer: signer.signer, binding });
      expect(await verifyCmsSignature(good)).toBe('valid');
      const wrong = await buildTestSignature({
        digest,
        signer: signer.signer,
        binding: { ...binding, certHash: new Uint8Array(64).fill(5) },
      });
      expect(await verifyCmsSignature(wrong)).toBe('invalid');
    }
  });

  test('a binding whose hash is unknown is unsupported, and no binding is fine', async () => {
    const signer = await createIdentity({ commonName: 'signer', ca: true });
    const unknown = await buildTestSignature({
      digest,
      signer: signer.signer,
      binding: { version: 2, hashOid: '2.16.840.1.101.3.4.2.8' },
    });
    expect(await verifyCmsSignature(unknown)).toBe('unsupported');
    // A broken signature is proof, whatever the binding.
    const broken = unknown.slice();
    broken[broken.length - 1]! ^= 0xff;
    expect(await verifyCmsSignature(broken)).toBe('invalid');

    const unbound = await buildTestSignature({ digest, signer: signer.signer });
    expect(await verifyCmsSignature(unbound)).toBe('valid');
  });

  test('the completion gate accepts a SHA-384 binding on a CAdES signature', async () => {
    const signer = await createIdentity({ commonName: 'signer', ca: true });
    const cms = await buildTestSignature({
      digest,
      signer: signer.signer,
      binding: { version: 2, hashOid: OID.sha384 },
    });
    const prepared = {
      signingId: 'test',
      digest,
      algorithm: 'sha256' as const,
      byteRange: [0, 100, 200, 50] as [number, number, number, number],
      contentsSizeBytes: 8192,
      subFilter: 'ETSI.CAdES.detached' as const,
      expectedVersion: { baseSha256: 'x', editsVersion: 0 },
      expiresAt: null,
    };
    expect(await verifyForCompletion({ cms, prepared, profile: 'cades-b' })).toEqual({ ok: true });
  });
});
