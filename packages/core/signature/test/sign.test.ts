import {
  constants,
  createPrivateKey,
  privateEncrypt,
  sign as nodeSign,
  type KeyObject,
} from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest';
import { createLocalEngine } from '@embedpdf/engine';
import {
  EngineError,
  EngineErrorCode,
  type DocumentHandle,
  type Engine,
} from '@embedpdf/engine-core/runtime';

import { attachSignatureTimestamp } from '../src/cms/attach';
import { parseCmsInternal } from '../src/cms/parse';
import { checkTimestampToken, signatureValueOf } from '../src/cms/verify-timestamp';
import {
  buildDetachedCms,
  completeSignature,
  createTestSigner,
  createTestTimestampAuthority,
  ecdsaRawFromDer,
  sign,
  validateSignatures,
  type CmsSigner,
  type RawSigner,
  type TestSigner,
  type TestTimestampAuthority,
} from '../src/index';

const here = dirname(fileURLToPath(import.meta.url));
const fixtures = resolve(here, '..', '..', '..', 'engine', 'main', 'test', 'fixtures');
const field = { kind: 'fqn', name: 'sig' } as const;

describe('signing with a timestamp', () => {
  let engine: Engine;
  let signer: TestSigner;
  let authority: TestTimestampAuthority;
  let bytes: Uint8Array;
  let opened = 0;

  beforeAll(async () => {
    engine = createLocalEngine({ runtime: { prefer: 'wasm' } });
    signer = await createTestSigner({ commonName: 'EmbedPDF test signer' });
    authority = await createTestTimestampAuthority();
    bytes = new Uint8Array(await readFile(resolve(fixtures, 'unsigned_sigfield.pdf')));
  });
  afterAll(async () => {
    await engine.destroy();
  });

  /** Run `body` on a fresh copy of the unsigned document. */
  async function withDocument<T>(body: (doc: DocumentHandle) => Promise<T>): Promise<T> {
    const doc = await engine.open({ kind: 'bytes', id: `timestamps-${opened++}`, bytes });
    try {
      return await body(doc);
    } finally {
      await doc.close();
    }
  }

  const isSigned = async (doc: DocumentHandle) =>
    (await doc.signatures.list()).signatures[0]!.signed;

  /** The one timestamp token of the document's signature, checked against its signature value. */
  async function timestampOf(doc: DocumentHandle) {
    const internal = parseCmsInternal(await doc.signatures.getContents(field));
    expect(internal.timestampTokens).toHaveLength(1);
    return checkTimestampToken({
      token: internal.timestampTokens[0]!,
      stamped: { kind: 'bytes', bytes: signatureValueOf(internal.signerInfo) },
    });
  }

  /** A raw key over `signer` that counts how often it signs. */
  function counting(from: TestSigner): RawSigner & { signed: number } {
    const key = {
      ...from,
      signed: 0,
      sign: (data: Uint8Array) => (key.signed++, from.sign(data)),
    };
    return key;
  }

  /** An authority that fails `failures` times with `Network`, then answers. */
  function flaky(failures: number): CmsSigner & { asked: number } {
    const flakyAuthority = {
      kind: 'cms' as const,
      asked: 0,
      sign: async (request: Parameters<CmsSigner['sign']>[0]) => {
        if (flakyAuthority.asked++ < failures) {
          throw new EngineError(EngineErrorCode.Network, 'the authority did not answer', {
            details: { authority: 'https://tsa.example.com/' },
          });
        }
        return authority.sign(request);
      },
    };
    return flakyAuthority;
  }

  test('one option timestamps the signature, and the document validates', async () => {
    await withDocument(async (doc) => {
      const prepare = vi.spyOn(doc.signatures, 'prepare');
      const result = await sign(doc, { field, key: signer, timestampAuthority: authority });
      expect(result.status).toBe('completed');
      // A token needs more room than the default reserve gives.
      expect(prepare.mock.calls[0]![0].contentsSizeBytes).toBe(16384);

      const stamp = await timestampOf(doc);
      expect(stamp.verdict).toBe('valid');
      expect(Date.now() - stamp.info!.genTime.getTime()).toBeLessThan(60_000);

      const [verdict] = await validateSignatures(doc, {
        trust: { anchors: async () => [signer.certificate] },
      });
      expect(verdict).toMatchObject({
        integrity: 'valid',
        cryptography: 'valid',
        trust: 'trusted',
        summary: 'valid',
      });
      expect(verdict!.cms!.timestampToken).not.toBeNull();
    });
  });

  test('without the option nothing changes: no token, and the default reserve', async () => {
    await withDocument(async (doc) => {
      const prepare = vi.spyOn(doc.signatures, 'prepare');
      await sign(doc, { field, key: signer });
      expect(prepare.mock.calls[0]![0].contentsSizeBytes).toBeUndefined();
      expect(parseCmsInternal(await doc.signatures.getContents(field)).timestampTokens).toEqual([]);
    });
  });

  test("a document prepared with SHA-384 is stamped with the authority's own hash", async () => {
    await withDocument(async (doc) => {
      const key = await createTestSigner({ hash: 'sha384' });
      await sign(doc, { field, key, timestampAuthority: { ...authority, hash: 'sha256' } });
      const stamp = await timestampOf(doc);
      expect(stamp.verdict).toBe('valid');
      expect(stamp.info!.imprintAlgorithm).toBe('sha256');
      const [verdict] = await validateSignatures(doc);
      expect(verdict!.cms!.digestAlgorithm).toBe('sha384');
    });
  });

  test("a CMS key's hash is the default digest", async () => {
    const keys = {
      sha256: signer,
      sha384: await createTestSigner({ hash: 'sha384' }),
      sha512: await createTestSigner({ hash: 'sha512' }),
    };
    const service: CmsSigner = {
      kind: 'cms',
      hash: 'sha384',
      sign: ({ digest, algorithm }) =>
        buildDetachedCms({
          digest,
          hash: algorithm,
          profile: 'cades-b',
          signer: keys[algorithm],
        }),
    };
    await withDocument(async (doc) => {
      const prepare = vi.spyOn(doc.signatures, 'prepare');
      await sign(doc, { field, key: service });
      expect(prepare.mock.calls[0]![0].digest).toBe('sha384');
    });
    // A digest named in the call wins over the key's.
    await withDocument(async (doc) => {
      const prepare = vi.spyOn(doc.signatures, 'prepare');
      await sign(doc, { field, key: service, digest: 'sha512' });
      expect(prepare.mock.calls[0]![0].digest).toBe('sha512');
    });
  });

  test('options that would do nothing are refused before anything is prepared', async () => {
    await withDocument(async (doc) => {
      const prepare = vi.spyOn(doc.signatures, 'prepare');
      await expect(
        sign(doc, { field, kind: 'timestamp', key: authority, timestampAuthority: authority }),
      ).rejects.toMatchObject({
        code: EngineErrorCode.InvalidArg,
        details: { field: 'timestampAuthority' },
      });
      await expect(
        sign(doc, { field, key: signer, timestampTrust: { anchors: async () => [] } }),
      ).rejects.toMatchObject({
        code: EngineErrorCode.InvalidArg,
        details: { field: 'timestampTrust' },
      });
      expect(prepare).not.toHaveBeenCalled();
    });
  });

  test('a timestamp that cannot be had fails the signing, and the document is as it was', async () => {
    await withDocument(async (doc) => {
      const key = counting(signer);
      await expect(
        sign(doc, { field, key, timestampAuthority: flaky(Infinity) }),
      ).rejects.toMatchObject({
        code: EngineErrorCode.Network,
        details: { authority: 'https://tsa.example.com/' },
      });
      expect(key.signed).toBe(1);
      expect(await isSigned(doc)).toBe(false);
      // Nothing is left pending: the same field signs.
      await sign(doc, { field, key: signer });
      expect(await isSigned(doc)).toBe(true);
    });
  });

  test('a CMS that does not sign the prepared digest never costs a timestamp', async () => {
    await withDocument(async (doc) => {
      const asked = flaky(0);
      const wrong: CmsSigner = {
        kind: 'cms',
        sign: () =>
          buildDetachedCms({
            digest: new Uint8Array(32).fill(1),
            hash: 'sha256',
            profile: 'cades-b',
            signer,
          }),
      };
      await expect(
        sign(doc, { field, key: wrong, timestampAuthority: asked }),
      ).rejects.toMatchObject({
        code: EngineErrorCode.SignatureRefused,
        details: { reason: 'digest-mismatch' },
      });
      expect(asked.asked).toBe(0);
      expect(await isSigned(doc)).toBe(false);
    });
  });

  test('a signing service that timestamps itself: its token is checked, and not doubled', async () => {
    /** A service whose CMS already carries a timestamp, over `digestOf(prepared digest)`. */
    const stamping = (digestOf: (digest: Uint8Array) => Uint8Array): CmsSigner => ({
      kind: 'cms',
      sign: async ({ digest }) =>
        attachSignatureTimestamp({
          cms: await buildDetachedCms({
            digest: digestOf(digest),
            hash: 'sha256',
            profile: 'cades-b',
            signer,
          }),
          authority,
        }),
    });
    const faithful = stamping((digest) => digest);

    await withDocument(async (doc) => {
      await sign(doc, { field, key: faithful });
      expect((await timestampOf(doc)).verdict).toBe('valid');
    });
    await withDocument(async (doc) => {
      await expect(
        sign(doc, { field, key: faithful, timestampAuthority: authority }),
      ).rejects.toMatchObject({
        code: EngineErrorCode.InvalidArg,
        details: { field: 'timestampAuthority' },
      });
      expect(await isSigned(doc)).toBe(false);
    });
    // A sound timestamp proves nothing about the signature it sits on.
    await withDocument(async (doc) => {
      const unfaithful = stamping((digest) => digest.map((byte) => byte ^ 0xff));
      await expect(sign(doc, { field, key: unfaithful })).rejects.toMatchObject({
        code: EngineErrorCode.SignatureRefused,
        details: { reason: 'digest-mismatch' },
      });
    });
  });

  test('timestampTrust: only an authority the port trusts is sealed in', async () => {
    const trusted = {
      anchors: async () => [],
      timestampAnchors: async () => [authority.certificate],
    };
    await withDocument(async (doc) => {
      await sign(doc, {
        field,
        key: signer,
        timestampAuthority: authority,
        timestampTrust: trusted,
      });
      expect((await timestampOf(doc)).verdict).toBe('valid');
    });
    await withDocument(async (doc) => {
      const stranger = await createTestTimestampAuthority({ commonName: 'a stranger' });
      const refusal = sign(doc, {
        field,
        key: signer,
        timestampAuthority: stranger,
        timestampTrust: trusted,
      });
      await expect(refusal).rejects.toMatchObject({
        code: EngineErrorCode.SignatureRefused,
        details: { trust: 'untrusted' },
      });
      await expect(refusal).rejects.toThrow(/"a stranger"/);
      expect(await isSigned(doc)).toBe(false);
    });
  });

  describe('in two steps', () => {
    const prepareAndSign = async (
      doc: DocumentHandle,
      key: RawSigner,
      contentsSizeBytes: number,
    ) => {
      const prepared = await doc.signatures.prepare({ field, contentsSizeBytes });
      const cms = await buildDetachedCms({
        digest: prepared.digest,
        hash: prepared.algorithm,
        profile: 'cades-b',
        signer: key,
      });
      return { prepared, cms };
    };
    const isPending = (doc: DocumentHandle) =>
      doc.forms.setValue({ kind: 'fqn', name: 'group.total' }, { value: 'changed' }).then(
        () => false,
        (error) => EngineError.is(error, EngineErrorCode.SigningPending),
      );

    test('completeSignature() checks the CMS, timestamps it and completes', async () => {
      await withDocument(async (doc) => {
        const { prepared, cms } = await prepareAndSign(doc, signer, 16384);
        const result = await completeSignature(doc, {
          prepared,
          cms,
          timestampAuthority: authority,
        });
        expect(result.status).toBe('completed');
        expect((await timestampOf(doc)).verdict).toBe('valid');
      });
    });

    test('an authority that does not answer leaves the signing prepared; the same CMS completes later', async () => {
      await withDocument(async (doc) => {
        const key = counting(signer);
        const { prepared, cms } = await prepareAndSign(doc, key, 16384);
        const timestampAuthority = flaky(1);

        await expect(
          completeSignature(doc, { prepared, cms, timestampAuthority }),
        ).rejects.toMatchObject({ code: EngineErrorCode.Network });
        expect(await isSigned(doc)).toBe(false);
        expect(await isPending(doc)).toBe(true);

        const result = await completeSignature(doc, { prepared, cms, timestampAuthority });
        expect(result.status).toBe('completed');
        expect(key.signed).toBe(1);
        expect((await timestampOf(doc)).verdict).toBe('valid');
      });
    });

    test('after a failure the caller may give up: cancelling frees the document', async () => {
      await withDocument(async (doc) => {
        const { prepared, cms } = await prepareAndSign(doc, signer, 16384);
        await expect(
          completeSignature(doc, { prepared, cms, timestampAuthority: flaky(Infinity) }),
        ).rejects.toMatchObject({ code: EngineErrorCode.Network });

        expect(await doc.signatures.cancel(prepared.signingId)).toMatchObject({
          status: 'cancelled',
        });
        expect(await isPending(doc)).toBe(false);
        expect(await isSigned(doc)).toBe(false);
      });
    });

    test('a refusal is final for that CMS, and says what to prepare with', async () => {
      await withDocument(async (doc) => {
        const probe = await buildDetachedCms({
          digest: new Uint8Array(32),
          hash: 'sha256',
          profile: 'cades-b',
          signer,
        });
        // Room for the signature alone: the token no longer fits.
        const { prepared, cms } = await prepareAndSign(doc, signer, probe.byteLength + 16);

        for (let attempt = 0; attempt < 2; attempt++) {
          const refusal = completeSignature(doc, { prepared, cms, timestampAuthority: authority });
          await expect(refusal).rejects.toMatchObject({
            code: EngineErrorCode.SignatureRefused,
            details: { reason: 'too-large' },
          });
          await expect(refusal).rejects.toThrow(/pass `contentsSizeBytes: 4096`/);
          await expect(refusal).rejects.toThrow(/cancel it and prepare again/);
        }
        expect(await isPending(doc)).toBe(true);
        await doc.signatures.cancel(prepared.signingId);
      });
    });

    test('a CMS that does not sign the prepared digest is refused, timestamp or not', async () => {
      await withDocument(async (doc) => {
        const { prepared } = await prepareAndSign(doc, signer, 16384);
        const cms = await buildDetachedCms({
          digest: new Uint8Array(32).fill(3),
          hash: 'sha256',
          profile: 'cades-b',
          signer,
        });
        const asked = flaky(0);
        await expect(completeSignature(doc, { prepared, cms })).rejects.toMatchObject({
          code: EngineErrorCode.SignatureRefused,
          details: { reason: 'digest-mismatch' },
        });
        await expect(
          completeSignature(doc, { prepared, cms, timestampAuthority: asked }),
        ).rejects.toMatchObject({ details: { reason: 'digest-mismatch' } });
        expect(asked.asked).toBe(0);
        expect(await isSigned(doc)).toBe(false);
        await doc.signatures.cancel(prepared.signingId);
      });
    });
  });

  describe('with a service that signs a hash', () => {
    const DIGEST_INFO_SHA256 = Uint8Array.from([
      0x30, 0x31, 0x30, 0x0d, 0x06, 0x09, 0x60, 0x86, 0x48, 0x01, 0x65, 0x03, 0x04, 0x02, 0x01,
      0x05, 0x00, 0x04, 0x20,
    ]);

    /**
     * A stand-in for a hash-signing service: it holds the key, takes a SHA-256 hash, and returns
     * the signature as such services do, DER for ECDSA. Node signs a ready-made hash with RSA
     * but not with ECDSA, so `hashOf` also shows the stand-in the bytes behind each hash.
     */
    async function hashSigningService(from: TestSigner) {
      const pkcs8 = await crypto.subtle.exportKey('pkcs8', from.privateKey);
      const key: KeyObject = createPrivateKey({
        key: Buffer.from(pkcs8),
        format: 'der',
        type: 'pkcs8',
      });
      const behind = new Map<string, Uint8Array>();
      const hex = (bytes: Uint8Array) => Buffer.from(bytes).toString('hex');
      return {
        async hashOf(data: Uint8Array): Promise<Uint8Array> {
          const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', new Uint8Array(data)));
          behind.set(hex(hash), data);
          return hash;
        },
        async signHash(hash: Uint8Array): Promise<Uint8Array> {
          if (from.algorithm === 'ECDSA') {
            return new Uint8Array(
              nodeSign('sha256', behind.get(hex(hash))!, { key, dsaEncoding: 'der' }),
            );
          }
          return new Uint8Array(
            privateEncrypt(
              { key, padding: constants.RSA_PKCS1_PADDING },
              Buffer.concat([DIGEST_INFO_SHA256, hash]),
            ),
          );
        },
      };
    }

    for (const algorithm of ['RSA-PKCS1-v1_5', 'ECDSA'] as const) {
      test(`${algorithm}: a raw key over the service signs, timestamps and validates`, async () => {
        const identity = await createTestSigner({ algorithm });
        const service = await hashSigningService(identity);
        const key: RawSigner = {
          kind: 'raw',
          certificateChain: [identity.certificate],
          algorithm,
          hash: 'sha256',
          async sign(signedAttributes) {
            const hash = await service.hashOf(signedAttributes);
            const signature = await service.signHash(hash);
            return algorithm === 'ECDSA' ? ecdsaRawFromDer(signature, 'P-256') : signature;
          },
        };

        await withDocument(async (doc) => {
          await sign(doc, { field, key, timestampAuthority: authority });
          expect((await timestampOf(doc)).verdict).toBe('valid');
          const [verdict] = await validateSignatures(doc, {
            trust: { anchors: async () => [identity.certificate] },
          });
          expect(verdict).toMatchObject({
            integrity: 'valid',
            cryptography: 'valid',
            trust: 'trusted',
            summary: 'valid',
          });
        });
      });
    }

    test('an ECDSA signature handed back as DER is refused, not written', async () => {
      const identity = await createTestSigner({ algorithm: 'ECDSA' });
      const service = await hashSigningService(identity);
      const key: RawSigner = {
        kind: 'raw',
        certificateChain: [identity.certificate],
        algorithm: 'ECDSA',
        hash: 'sha256',
        async sign(signedAttributes) {
          return service.signHash(await service.hashOf(signedAttributes));
        },
      };
      await withDocument(async (doc) => {
        await expect(sign(doc, { field, key })).rejects.toMatchObject({
          code: EngineErrorCode.SignatureRefused,
          details: { reason: 'signature-invalid' },
        });
        expect(await isSigned(doc)).toBe(false);
      });
    });
  });
});
