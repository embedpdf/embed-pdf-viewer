import { describe, expect, test } from 'vitest';

import { certificateFromDer } from '../../src/cms/parse';
import { checkTimestampToken } from '../../src/cms/verify-timestamp';
import { OID } from '../../src/cms/oids';
import { createTestTimestampAuthority } from '../../src/index';
import { createOpenSslAuthority, hasOpenSsl } from '../helpers/openssl';
import { createTimestampAuthorityIdentity } from '../helpers/pki';
import { buildTestToken } from '../helpers/tokens';

const digest = new Uint8Array(32).map((_, i) => (i * 13 + 1) & 0xff);
const stamped = { kind: 'digest', digest, algorithm: 'sha256' } as const;
const otherDigest = digest.map((byte) => byte ^ 0xff);

/** Flip a byte of the signature value: the tail of a token that has no unsigned attributes. */
function withBrokenSignature(token: Uint8Array): Uint8Array {
  const broken = token.slice();
  broken[broken.length - 1]! ^= 0xff;
  return broken;
}

describe('a timestamp token that verifies', () => {
  test("the package's own test authority makes one, and its facts come back", async () => {
    const authority = await createTestTimestampAuthority();
    const token = await authority.sign({ digest, algorithm: 'sha256', subFilter: 'ETSI.RFC3161' });

    const check = await checkTimestampToken({ token, stamped });
    expect(check).toMatchObject({ verdict: 'valid', problem: null, detail: null });
    expect(check.info!.imprintAlgorithm).toBe('sha256');
    expect(Array.from(check.info!.imprint)).toEqual(Array.from(digest));
    expect(Array.from(check.token!.parsed.signerCertificate)).toEqual(
      Array.from(authority.certificate),
    );
  });

  test('stamped bytes are hashed with the algorithm the token names', async () => {
    const authority = await createTimestampAuthorityIdentity('authority');
    const bytes = new TextEncoder().encode('a signature value');
    for (const hash of ['sha256', 'sha384', 'sha512'] as const) {
      const imprint = new Uint8Array(
        await crypto.subtle.digest(hash.replace('sha', 'SHA-'), bytes),
      );
      const token = await buildTestToken({ digest: imprint, hash, authority: authority.signer });
      const check = await checkTimestampToken({ token, stamped: { kind: 'bytes', bytes } });
      expect(check.verdict, hash).toBe('valid');
    }
  });

  for (const [name, binding] of [
    ['a signing-certificate (SHA-1) binding', { version: 1 }],
    ['a signing-certificate-v2 binding that names SHA-256', { version: 2, hashOid: OID.sha256 }],
    ['a signing-certificate-v2 binding with SHA-384', { version: 2, hashOid: OID.sha384 }],
    ['a signing-certificate-v2 binding with SHA-512', { version: 2, hashOid: OID.sha512 }],
  ] as const) {
    test(`${name} is read and checked`, async () => {
      const authority = await createTimestampAuthorityIdentity('authority');
      const token = await buildTestToken({ digest, authority: authority.signer, binding });
      expect((await checkTimestampToken({ token, stamped })).verdict).toBe('valid');

      // The same binding over another certificate is proof of a wrong token.
      const wrong = await buildTestToken({
        digest,
        authority: authority.signer,
        binding: { ...binding, certHash: new Uint8Array(64).fill(1) },
      });
      expect(await checkTimestampToken({ token: wrong, stamped })).toMatchObject({
        verdict: 'invalid',
        problem: 'binding',
      });
    });
  }

  test("the authority's certificate may sit in the signature the token is in", async () => {
    const authority = await createTimestampAuthorityIdentity('authority');
    const token = await buildTestToken({
      digest,
      authority: authority.signer,
      carriesCertificate: false,
    });

    const alone = await checkTimestampToken({ token, stamped });
    expect(alone).toMatchObject({ verdict: 'unsupported', problem: 'no-certificate' });
    expect(alone.token).toBeNull();
    // What the token asserts is still readable.
    expect(alone.info!.genTime).toBeInstanceOf(Date);

    const offered = await checkTimestampToken({
      token,
      stamped,
      certificates: [certificateFromDer(authority.certificate)],
    });
    expect(offered.verdict).toBe('valid');
  });
});

describe('a timestamp token proven wrong is invalid', () => {
  test('it stamps another digest', async () => {
    const authority = await createTimestampAuthorityIdentity('authority');
    const token = await buildTestToken({ digest: otherDigest, authority: authority.signer });
    expect(await checkTimestampToken({ token, stamped })).toMatchObject({
      verdict: 'invalid',
      problem: 'imprint',
    });
  });

  test('it stamps the same bytes under another algorithm', async () => {
    const authority = await createTimestampAuthorityIdentity('authority');
    const longer = new Uint8Array(48).fill(3);
    const token = await buildTestToken({
      digest: longer,
      hash: 'sha384',
      authority: authority.signer,
    });
    expect(await checkTimestampToken({ token, stamped })).toMatchObject({
      verdict: 'invalid',
      problem: 'imprint-algorithm',
    });
  });

  test('its message digest does not cover its TSTInfo', async () => {
    const authority = await createTimestampAuthorityIdentity('authority');
    const token = await buildTestToken({
      digest,
      authority: authority.signer,
      swapsContent: true,
    });
    expect(await checkTimestampToken({ token, stamped })).toMatchObject({
      verdict: 'invalid',
      problem: 'message-digest',
    });
  });

  test('its signature does not verify', async () => {
    const authority = await createTimestampAuthorityIdentity('authority');
    const token = await buildTestToken({ digest, authority: authority.signer });
    expect(await checkTimestampToken({ token: withBrokenSignature(token), stamped })).toMatchObject(
      { verdict: 'invalid', problem: 'signature' },
    );
  });

  test('proof wins over what cannot be checked: a wrong imprint without a certificate', async () => {
    const authority = await createTimestampAuthorityIdentity('authority');
    const token = await buildTestToken({
      digest: otherDigest,
      authority: authority.signer,
      carriesCertificate: false,
    });
    expect(await checkTimestampToken({ token, stamped })).toMatchObject({
      verdict: 'invalid',
      problem: 'imprint',
    });
  });
});

describe('a timestamp token that cannot be checked is unsupported, never invalid', () => {
  test('bytes that are not a token', async () => {
    const garbage = new Uint8Array([0x30, 0x03, 0x02, 0x01, 0x05]);
    expect(await checkTimestampToken({ token: garbage, stamped })).toMatchObject({
      verdict: 'unsupported',
      problem: 'unreadable',
      info: null,
      token: null,
    });
    expect(await checkTimestampToken({ token: new Uint8Array(), stamped })).toMatchObject({
      verdict: 'unsupported',
      problem: 'unreadable',
    });
  });

  test('a binding whose hash is unknown', async () => {
    const authority = await createTimestampAuthorityIdentity('authority');
    const token = await buildTestToken({
      digest,
      authority: authority.signer,
      binding: { version: 2, hashOid: '2.16.840.1.101.3.4.2.8' },
    });
    expect(await checkTimestampToken({ token, stamped })).toMatchObject({
      verdict: 'unsupported',
      problem: 'unsupported-algorithm',
    });
  });

  test('no binding at all: RFC 3161 requires one, so the token is never valid', async () => {
    const authority = await createTimestampAuthorityIdentity('authority');
    const token = await buildTestToken({ digest, authority: authority.signer, binding: null });
    expect(await checkTimestampToken({ token, stamped })).toMatchObject({
      verdict: 'unsupported',
      problem: 'no-binding',
    });
    // A broken signature is still proof, binding or not.
    expect(await checkTimestampToken({ token: withBrokenSignature(token), stamped })).toMatchObject(
      { verdict: 'invalid', problem: 'signature' },
    );
  });
});

describe.skipIf(!hasOpenSsl)('tokens made by OpenSSL', () => {
  for (const bindingHash of ['sha1', 'sha256', 'sha384', 'sha512'] as const) {
    test(`a token whose binding hashes with ${bindingHash} verifies`, async () => {
      const authority = createOpenSslAuthority(bindingHash);
      try {
        const token = authority.stamp(digest);
        const check = await checkTimestampToken({ token, stamped });
        expect(check).toMatchObject({ verdict: 'valid', problem: null });
        expect(check.token!.bindings.map((binding) => binding.version)).toEqual([
          bindingHash === 'sha1' ? 1 : 2,
        ]);
        expect(Array.from(check.token!.parsed.signerCertificate)).toEqual(
          Array.from(authority.certificate),
        );
        expect(
          await checkTimestampToken({ token, stamped: { ...stamped, digest: otherDigest } }),
        ).toMatchObject({ verdict: 'invalid', problem: 'imprint' });
      } finally {
        authority.dispose();
      }
    });
  }
});
