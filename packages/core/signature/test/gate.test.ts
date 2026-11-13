import { describe, expect, test } from 'vitest';

import { OID } from '../src/cms/oids';
import { verifyForCompletion } from '../src/index';
import { createOpenSslAuthority, hasOpenSsl } from './helpers/openssl';
import { createTimestampAuthorityIdentity } from './helpers/pki';
import { buildTestToken, type TestBinding } from './helpers/tokens';

const digest = new Uint8Array(32).map((_, i) => (i * 3 + 17) & 0xff);
const prepared = {
  signingId: 'timestamp',
  digest,
  algorithm: 'sha256' as const,
  byteRange: [0, 100, 200, 50] as [number, number, number, number],
  contentsSizeBytes: 8192,
  subFilter: 'ETSI.RFC3161' as const,
  expectedVersion: { baseSha256: 'x', editsVersion: 0 },
  expiresAt: null,
};
const complete = (cms: Uint8Array) => verifyForCompletion({ cms, prepared, profile: 'timestamp' });

describe('completing a document timestamp', () => {
  for (const [name, binding] of [
    ['signing-certificate-v2 with SHA-256', { version: 2 }],
    ['signing-certificate, the SHA-1 binding', { version: 1 }],
    ['signing-certificate-v2 with SHA-384', { version: 2, hashOid: OID.sha384 }],
    ['signing-certificate-v2 with SHA-512', { version: 2, hashOid: OID.sha512 }],
  ] as [string, TestBinding][]) {
    test(`a token that binds its certificate with ${name} completes`, async () => {
      const authority = await createTimestampAuthorityIdentity('authority');
      const token = await buildTestToken({ digest, authority: authority.signer, binding });
      expect(await complete(token)).toEqual({ ok: true });
    });
  }

  test.skipIf(!hasOpenSsl)('a token made by OpenSSL completes, with either binding', async () => {
    for (const bindingHash of ['sha1', 'sha384'] as const) {
      const authority = createOpenSslAuthority(bindingHash);
      try {
        expect(await complete(authority.stamp(digest)), bindingHash).toEqual({ ok: true });
      } finally {
        authority.dispose();
      }
    }
  });

  test('a token proven wrong is refused, with the reason that names what is wrong', async () => {
    const authority = await createTimestampAuthorityIdentity('authority');
    const signer = authority.signer;

    const otherDigest = await buildTestToken({
      digest: digest.map((b) => b ^ 1),
      authority: signer,
    });
    expect(await complete(otherDigest)).toMatchObject({ ok: false, reason: 'digest-mismatch' });

    const otherHash = await buildTestToken({
      digest: new Uint8Array(48).fill(2),
      hash: 'sha384',
      authority: signer,
    });
    expect(await complete(otherHash)).toMatchObject({
      ok: false,
      reason: 'algorithm-mismatch',
      detail: 'the token stamps a sha384 digest, the document was prepared with sha256',
    });

    const swapped = await buildTestToken({ digest, authority: signer, swapsContent: true });
    expect(await complete(swapped)).toMatchObject({ ok: false, reason: 'signature-invalid' });

    const wrongBinding = await buildTestToken({
      digest,
      authority: signer,
      binding: { version: 1, certHash: new Uint8Array(20).fill(9) },
    });
    expect(await complete(wrongBinding)).toMatchObject({ ok: false, reason: 'signature-invalid' });
  });

  test('a token that cannot be checked is refused too: this timestamp was asked for', async () => {
    const authority = await createTimestampAuthorityIdentity('authority');
    const signer = authority.signer;

    const unknownHash = await buildTestToken({
      digest,
      authority: signer,
      binding: { version: 2, hashOid: '2.16.840.1.101.3.4.2.8' },
    });
    expect(await complete(unknownHash)).toMatchObject({ ok: false, reason: 'signature-invalid' });

    const unbound = await buildTestToken({ digest, authority: signer, binding: null });
    expect(await complete(unbound)).toMatchObject({
      ok: false,
      reason: 'signature-invalid',
      detail: "the token does not bind its authority's certificate, which RFC 3161 requires",
    });

    const bare = await buildTestToken({ digest, authority: signer, carriesCertificate: false });
    expect(await complete(bare)).toMatchObject({ ok: false, reason: 'malformed' });

    expect(await complete(new Uint8Array([0x30, 0x03, 0x02, 0x01, 0x05]))).toMatchObject({
      ok: false,
      reason: 'malformed',
    });
  });
});
