import { EngineErrorCode } from '@embedpdf/engine-core/runtime';
import { describe, expect, test } from 'vitest';

import { attachSignatureTimestamp, timestampTokenAttribute } from '../../src/cms/attach';
import { parseCmsInternal } from '../../src/cms/parse';
import { addUnsignedAttribute, encodeElement } from '../../src/cms/splice';
import { verifyCmsSignature } from '../../src/cms/verify';
import { checkTimestampToken, signatureValueOf } from '../../src/cms/verify-timestamp';
import {
  buildDetachedCms,
  createTestSigner,
  createTestTimestampAuthority,
  verifyForCompletion,
  type CmsSigner,
  type TrustPort,
} from '../../src/index';
import { hasOpenSsl, opensslVerifiesToken } from '../helpers/openssl';
import { createAuthorityRoot, createTimestampAuthorityIdentity } from '../helpers/pki';
import { buildTestToken } from '../helpers/tokens';

const digest = new Uint8Array(32).map((_, i) => (i * 7 + 3) & 0xff);
const prepared = {
  signingId: 'test',
  digest,
  algorithm: 'sha256' as const,
  byteRange: [0, 100, 200, 50] as [number, number, number, number],
  contentsSizeBytes: 16384,
  subFilter: 'ETSI.CAdES.detached' as const,
  expectedVersion: { baseSha256: 'x', editsVersion: 0 },
  expiresAt: null,
};
const sha256 = async (bytes: Uint8Array) =>
  new Uint8Array(await crypto.subtle.digest('SHA-256', new Uint8Array(bytes)));

async function signedCms(algorithm: 'RSA-PKCS1-v1_5' | 'RSA-PSS' | 'ECDSA' = 'RSA-PKCS1-v1_5') {
  const signer = await createTestSigner({ algorithm });
  return buildDetachedCms({ digest, hash: 'sha256', profile: 'cades-b', signer });
}

/** An authority that answers every request with `token`, whatever was asked. */
const answering = (token: Uint8Array | (() => Promise<Uint8Array>)): CmsSigner => ({
  kind: 'cms',
  sign: async () => (typeof token === 'function' ? token() : token),
});

describe('timestamping a finished signature', () => {
  for (const algorithm of ['RSA-PKCS1-v1_5', 'RSA-PSS', 'ECDSA'] as const) {
    test(`${algorithm}: the token stamps the signature value, here and for OpenSSL`, async () => {
      const cms = await signedCms(algorithm);
      const authority = await createTestTimestampAuthority();
      const stamped = await attachSignatureTimestamp({ cms, authority });

      const internal = parseCmsInternal(stamped);
      expect(internal.timestampTokens).toHaveLength(1);
      const token = internal.timestampTokens[0]!;
      const value = signatureValueOf(internal.signerInfo);
      const check = await checkTimestampToken({ token, stamped: { kind: 'bytes', bytes: value } });
      expect(check.verdict).toBe('valid');
      // The signature is the one that was handed in, and the gate takes the two together.
      expect(await verifyCmsSignature(stamped)).toBe('valid');
      expect(Array.from(value)).toEqual(
        Array.from(signatureValueOf(parseCmsInternal(cms).signerInfo)),
      );
      expect(await verifyForCompletion({ cms: stamped, prepared, profile: 'cades-b' })).toEqual({
        ok: true,
      });

      if (!hasOpenSsl) return;
      const anchor = authority.certificate;
      expect(opensslVerifiesToken({ token, digest: await sha256(value), anchor }).ok).toBe(true);
      // The octet string with its tag and length is not what a timestamp stamps.
      const wrapped = await sha256(encodeElement(0x04, value));
      expect(opensslVerifiesToken({ token, digest: wrapped, anchor }).ok).toBe(false);
    });
  }

  test("the imprint is hashed with the authority's hash, not the document's", async () => {
    const cms = await signedCms();
    const authority = await createTestTimestampAuthority();
    const stamped = await attachSignatureTimestamp({
      cms,
      authority: { ...authority, hash: 'sha384' },
    });
    const internal = parseCmsInternal(stamped);
    const check = await checkTimestampToken({
      token: internal.timestampTokens[0]!,
      stamped: { kind: 'bytes', bytes: signatureValueOf(internal.signerInfo) },
    });
    expect(check.verdict).toBe('valid');
    expect(check.info!.imprintAlgorithm).toBe('sha384');
  });

  test('a token over the octet string with its tag and length is refused, by attach and the gate', async () => {
    const cms = await signedCms();
    const value = signatureValueOf(parseCmsInternal(cms).signerInfo);
    const authority = await createTestTimestampAuthority();
    const wrongToken = await authority.sign({
      digest: await sha256(encodeElement(0x04, value)),
      algorithm: 'sha256',
      subFilter: 'ETSI.RFC3161',
    });

    await expect(
      attachSignatureTimestamp({ cms, authority: answering(wrongToken) }),
    ).rejects.toMatchObject({
      code: EngineErrorCode.SignatureRefused,
      details: { reason: 'digest-mismatch' },
    });

    const carried = addUnsignedAttribute(cms, timestampTokenAttribute(wrongToken));
    expect(await verifyForCompletion({ cms: carried, prepared, profile: 'cades-b' })).toMatchObject(
      { ok: false, reason: 'digest-mismatch' },
    );
  });

  test('a token that cannot be checked: refused when asked for, passed when a service brought it', async () => {
    const cms = await signedCms();
    const value = signatureValueOf(parseCmsInternal(cms).signerInfo);
    const identity = await createTimestampAuthorityIdentity('authority');
    const unknownHash = await buildTestToken({
      digest: await sha256(value),
      authority: identity.signer,
      binding: { version: 2, hashOid: '2.16.840.1.101.3.4.2.8' },
    });

    await expect(
      attachSignatureTimestamp({ cms, authority: answering(unknownHash) }),
    ).rejects.toMatchObject({
      code: EngineErrorCode.SignatureRefused,
      details: { reason: 'signature-invalid' },
    });

    const carried = addUnsignedAttribute(cms, timestampTokenAttribute(unknownHash));
    expect(await verifyForCompletion({ cms: carried, prepared, profile: 'cades-b' })).toEqual({
      ok: true,
    });
  });

  test('a signature that already carries a timestamp is not stamped twice', async () => {
    const authority = await createTestTimestampAuthority();
    const stamped = await attachSignatureTimestamp({ cms: await signedCms(), authority });
    let asked = 0;
    const counting: CmsSigner = {
      kind: 'cms',
      sign: (request) => (asked++, authority.sign(request)),
    };

    await expect(
      attachSignatureTimestamp({ cms: stamped, authority: counting }),
    ).rejects.toMatchObject({
      code: EngineErrorCode.InvalidArg,
      details: { field: 'timestampAuthority' },
    });
    expect(asked).toBe(0);
  });

  test('a signing service passed as the authority is named as the likely mix-up', async () => {
    const cms = await signedCms();
    const notAToken = await signedCms();
    const refusal = attachSignatureTimestamp({ cms, authority: answering(notAToken) });
    await expect(refusal).rejects.toMatchObject({
      code: EngineErrorCode.SignatureRefused,
      details: { reason: 'malformed' },
    });
    await expect(refusal).rejects.toThrow(/is it a signing service\?/);
  });

  test('what the authority throws is passed on as it is', async () => {
    const failure = new Error('the authority is on fire');
    const authority = answering(() => Promise.reject(failure));
    await expect(attachSignatureTimestamp({ cms: await signedCms(), authority })).rejects.toBe(
      failure,
    );
  });

  test('bytes that are not a CMS are refused as malformed', async () => {
    const authority = await createTestTimestampAuthority();
    await expect(
      attachSignatureTimestamp({ cms: new Uint8Array([0x30, 0x01, 0x00]), authority }),
    ).rejects.toMatchObject({
      code: EngineErrorCode.SignatureRefused,
      details: { reason: 'malformed' },
    });
  });
});

describe('timestamping with trust', () => {
  test('an authority the port trusts is attached; one it does not is refused', async () => {
    const cms = await signedCms();
    const root = await createAuthorityRoot('authority root');
    const identity = await createTimestampAuthorityIdentity('the trusted authority', root);
    const value = signatureValueOf(parseCmsInternal(cms).signerInfo);
    const authority = answering(() =>
      sha256(value).then((imprint) =>
        buildTestToken({ digest: imprint, authority: identity.signer }),
      ),
    );

    const trusting: TrustPort = {
      anchors: async () => [],
      timestampAnchors: async () => [root.certificate],
    };
    const stamped = await attachSignatureTimestamp({ cms, authority, trust: trusting });
    expect(parseCmsInternal(stamped).timestampTokens).toHaveLength(1);

    const other = await createAuthorityRoot('another root');
    const refusal = attachSignatureTimestamp({
      cms,
      authority,
      trust: { anchors: async () => [], timestampAnchors: async () => [other.certificate] },
    });
    await expect(refusal).rejects.toMatchObject({
      code: EngineErrorCode.SignatureRefused,
      details: { trust: 'untrusted' },
    });
    await expect(refusal).rejects.toThrow(/"the trusted authority"/);
    await expect(refusal).rejects.toThrow(/timestampAnchors/);

    // A port that names no anchors has not said who it trusts: that is not trust either.
    await expect(
      attachSignatureTimestamp({ cms, authority, trust: { anchors: async () => [] } }),
    ).rejects.toMatchObject({
      code: EngineErrorCode.SignatureRefused,
      details: { trust: 'unknown', trustReason: 'no trust anchors configured' },
    });
  });

  test('without trust, nothing about the authority is judged', async () => {
    const authority = await createTestTimestampAuthority();
    const stamped = await attachSignatureTimestamp({ cms: await signedCms(), authority });
    expect(parseCmsInternal(stamped).timestampTokens).toHaveLength(1);
  });
});
