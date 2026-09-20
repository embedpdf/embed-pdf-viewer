import { describe, expect, test } from 'vitest';
import {
  buildDetachedCms,
  createTestSigner,
  parseDetachedCms,
  validateChain,
  verifyCmsSignature,
  verifyForCompletion,
  type RawSigner,
} from '../src/index';

const digest = new Uint8Array(32).map((_, i) => (i * 7 + 3) & 0xff);
const prepared = {
  signingId: 'test',
  digest,
  algorithm: 'sha256' as const,
  byteRange: [0, 100, 200, 50] as [number, number, number, number],
  contentsSize: 8192,
  subFilter: 'ETSI.CAdES.detached' as const,
  expectedVersion: { baseSha256: 'x', editsVersion: 0 },
  expiresAt: null,
};

describe('detached CMS: build → parse → verify', () => {
  for (const algorithm of ['RSA-PKCS1-v1_5', 'RSA-PSS', 'ECDSA'] as const) {
    test(`${algorithm}: a CAdES-B CMS round-trips and verifies`, async () => {
      const signer = await createTestSigner({ algorithm });
      const cms = await buildDetachedCms({ digest, hash: 'sha256', profile: 'cades-b', signer });
      expect(cms[0]).toBe(0x30);
      const parsed = parseDetachedCms(cms);
      expect(parsed.digestAlgorithm).toBe('sha256');
      expect(Array.from(parsed.messageDigest)).toEqual(Array.from(digest));
      expect(parsed.signingTime).toBeNull();
      expect(parsed.signingCertificateV2).toBe(true);
      expect(parsed.certificates).toHaveLength(1);
      expect(Array.from(parsed.signerCertificate)).toEqual(Array.from(signer.certificate));
      expect(parsed.timestampToken).toBeNull();
      expect(await verifyCmsSignature(cms)).toBe('valid');
      // Flip a byte of the signature value (the tail of the CMS): invalid, never unsupported.
      const tampered = cms.slice();
      tampered[tampered.byteLength - 1] ^= 0x01;
      expect(await verifyCmsSignature(tampered)).toBe('invalid');
      expect(await verifyForCompletion({ cms, prepared, profile: 'cades-b' })).toEqual({
        ok: true,
      });
    });
  }

  test('a PKCS#7 CMS carries signing-time and no ESS attribute', async () => {
    const signer = await createTestSigner();
    const when = new Date('2026-09-11T00:00:00Z');
    const cms = await buildDetachedCms({
      digest,
      hash: 'sha256',
      profile: 'pkcs7',
      signer,
      signingTime: when,
    });
    const parsed = parseDetachedCms(cms);
    expect(parsed.signingTime?.toISOString()).toBe(when.toISOString());
    expect(parsed.signingCertificateV2).toBe(false);
    expect(parsed.signatureAlgorithm).toBe('1.2.840.113549.1.1.11');
    expect(await verifyCmsSignature(cms)).toBe('valid');
    expect(await verifyForCompletion({ cms, prepared, profile: 'pkcs7' })).toEqual({ ok: true });
    // The same CMS does not satisfy the CAdES profile.
    const gate = await verifyForCompletion({ cms, prepared, profile: 'cades-b' });
    expect(gate.ok).toBe(false);
    expect(!gate.ok && gate.reason).toBe('profile-violation');
  });

  test('the completion gate refuses what does not match the prepared digest', async () => {
    const signer = await createTestSigner();
    const other = digest.slice();
    other[0] ^= 0xff;
    const wrongDigest = await buildDetachedCms({
      digest: other,
      hash: 'sha256',
      profile: 'cades-b',
      signer,
    });
    expect(
      await verifyForCompletion({ cms: wrongDigest, prepared, profile: 'cades-b' }),
    ).toMatchObject({
      ok: false,
      reason: 'digest-mismatch',
    });
    const sha384 = await createTestSigner({ hash: 'sha384' });
    const wrongAlgorithm = await buildDetachedCms({
      digest: new Uint8Array(48),
      hash: 'sha384',
      profile: 'cades-b',
      signer: sha384,
    });
    expect(
      await verifyForCompletion({ cms: wrongAlgorithm, prepared, profile: 'cades-b' }),
    ).toMatchObject({
      ok: false,
      reason: 'algorithm-mismatch',
    });
    const cms = await buildDetachedCms({ digest, hash: 'sha256', profile: 'cades-b', signer });
    expect(
      await verifyForCompletion({
        cms,
        prepared: { ...prepared, contentsSize: 16 },
        profile: 'cades-b',
      }),
    ).toMatchObject({ ok: false, reason: 'too-large' });
    expect(
      await verifyForCompletion({ cms: new Uint8Array([1, 2, 3]), prepared, profile: 'cades-b' }),
    ).toMatchObject({ ok: false, reason: 'malformed' });
    const tampered = cms.slice();
    tampered[tampered.byteLength - 2] ^= 0x10;
    expect(
      await verifyForCompletion({ cms: tampered, prepared, profile: 'cades-b' }),
    ).toMatchObject({
      ok: false,
      reason: 'signature-invalid',
    });
  });

  test('a signer whose hash disagrees with the prepared digest is refused before signing', async () => {
    const signer = await createTestSigner({ hash: 'sha384' });
    await expect(
      buildDetachedCms({ digest, hash: 'sha256', profile: 'cades-b', signer }),
    ).rejects.toThrow(/hashes with sha384/);
    const sha256: RawSigner = { ...(await createTestSigner()), hash: 'sha256' };
    await expect(
      buildDetachedCms({
        digest: new Uint8Array(20),
        hash: 'sha256',
        profile: 'cades-b',
        signer: sha256,
      }),
    ).rejects.toThrow(/20 bytes/);
  });

  test('trust: the signer chains to its own certificate and to nothing else', async () => {
    const signer = await createTestSigner();
    const stranger = await createTestSigner({ commonName: 'someone else' });
    const cms = await buildDetachedCms({ digest, hash: 'sha256', profile: 'cades-b', signer });
    expect(await validateChain(cms, null)).toMatchObject({ status: 'unknown' });
    expect(await validateChain(cms, { anchors: async () => [] })).toMatchObject({
      status: 'unknown',
    });
    const trusted = await validateChain(cms, { anchors: async () => [signer.certificate] });
    expect(trusted.status).toBe('trusted');
    // PKI.js reports the anchor as the path's end even when the leaf is the anchor.
    expect((trusted.path?.length ?? 0) >= 1).toBe(true);
    expect(Array.from(trusted.path![trusted.path!.length - 1])).toEqual(
      Array.from(signer.certificate),
    );
    const untrusted = await validateChain(cms, { anchors: async () => [stranger.certificate] });
    expect(untrusted.status).toBe('untrusted');
    // A chain judged before the certificate existed is untrusted.
    const early = await validateChain(
      cms,
      { anchors: async () => [signer.certificate] },
      {
        kind: 'timestamp',
        genTime: new Date('2000-01-01T00:00:00Z'),
        tokenVerified: true,
      },
    );
    expect(early.status).toBe('untrusted');
  });
});
