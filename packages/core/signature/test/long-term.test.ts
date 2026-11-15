/**
 * Revocation and long-term validation, read from the answers a file holds. A certificate
 * authority made for the test issues the signer and answers about it, with a clock the test
 * sets, so each answer is dated when the scenario needs it. Nothing here asks a network.
 */
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { createLocalEngine } from '@embedpdf/engine';
import type { DocumentHandle, Engine } from '@embedpdf/engine-core/runtime';

import { certificateFromDer } from '../src/cms/parse';
import { revocationAddresses } from '../src/revocation/addresses';
import { buildOcspRequest } from '../src/revocation/request';
import { buildCrl, issueCertificate } from '../src/signers/test-authority';
import {
  createTestCertificateAuthority,
  createTestSigner,
  generateSigningKeyPair,
  sign,
  validateSignatures,
  verifyTimestampToken,
  webCryptoSigner,
  type CmsSigner,
  type TestCertificateAuthority,
  type TestSigner,
  type TrustPort,
} from '../src/index';
import { createIdentity, createTimestampAuthorityIdentity, type TestIdentity } from './helpers/pki';
import { buildTestToken } from './helpers/tokens';

const here = dirname(fileURLToPath(import.meta.url));
const fixtures = resolve(here, '..', '..', '..', 'engine', 'main', 'test', 'fixtures');
const field = { kind: 'fqn', name: 'sig' } as const;
const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const earliest = { kind: 'earliest-timestamp' } as const;

/**
 * When every scenario's signature is timestamped: six hours ago, on a whole second, as a list
 * of withdrawn certificates keeps its times.
 */
const SIGNED = new Date(Math.floor((Date.now() - 6 * HOUR) / 1000) * 1000);
const after = (ms: number) => new Date(SIGNED.getTime() + ms);

/** An authority whose tokens say `genTime`. */
function stamping(identity: TestIdentity, genTime: Date): CmsSigner {
  return {
    kind: 'cms',
    sign: ({ digest, algorithm }) =>
      buildTestToken({ digest, hash: algorithm, authority: identity.signer, genTime }),
  };
}

describe('revocation and long-term validation, from the file', () => {
  let engine: Engine;
  let bytes: Uint8Array;
  let opened = 0;
  /** The clock the certificate authority dates its answers by. */
  let clock: Date;
  let ca: TestCertificateAuthority;
  let signer: TestSigner;
  /** A timestamp authority trusted as it is: nothing can withdraw it. */
  let authority: TestIdentity;
  let trust: TrustPort;

  beforeAll(async () => {
    engine = createLocalEngine({ runtime: { prefer: 'wasm' } });
    bytes = new Uint8Array(await readFile(resolve(fixtures, 'unsigned_sigfield.pdf')));
    authority = await createTimestampAuthorityIdentity('the timestamp authority', undefined, {
      notBefore: new Date(Date.now() - 60 * DAY),
      notAfter: new Date(Date.now() + 300 * DAY),
    });
  });
  afterAll(async () => {
    await engine.destroy();
  });

  /** A fresh authority and signer for each scenario: one's withdrawal is not another's. */
  async function freshSigner(): Promise<void> {
    clock = new Date();
    ca = await createTestCertificateAuthority({
      commonName: 'the certificate authority',
      now: () => clock,
    });
    signer = await ca.issueSigner({ commonName: 'Ada' });
    trust = {
      anchors: async () => [ca.certificate],
      timestampAnchors: async () => [authority.certificate],
    };
  }

  async function withDocument<T>(body: (doc: DocumentHandle) => Promise<T>): Promise<T> {
    const doc = await engine.open({ kind: 'bytes', id: `long-term-${opened++}`, bytes });
    try {
      return await body(doc);
    } finally {
      await doc.close();
    }
  }

  /** Sign as Ada, timestamped at {@link SIGNED}. */
  const signTimestamped = (doc: DocumentHandle) =>
    sign(doc, { field, key: signer, timestampAuthority: stamping(authority, SIGNED) });

  /** What the authority answers about Ada when its clock says `at`. */
  async function answer(kind: 'ocsp' | 'crl', at: Date): Promise<Uint8Array> {
    clock = at;
    const certificate = certificateFromDer(signer.certificate);
    const url = revocationAddresses(certificate)[kind][0]!;
    return ca.revocation.fetch(
      kind === 'ocsp'
        ? {
            kind,
            url,
            body: await buildOcspRequest(certificate, certificateFromDer(ca.certificate)),
          }
        : { kind, url },
    );
  }

  /** The signature judged as of now, and at its timestamp, which is what is judged by default. */
  const both = async (doc: DocumentHandle, port: TrustPort = trust) => {
    const [then] = await validateSignatures(doc, { trust: port });
    const [named] = await validateSignatures(doc, { trust: port, validationTime: earliest });
    expect(named).toEqual(then);
    return {
      now: (await validateSignatures(doc, { trust: port, validationTime: { kind: 'now' } }))[0]!,
      then: then!,
    };
  };

  describe('revocation', () => {
    test('no answer in the file: unknown, and the summary stays', async () => {
      await freshSigner();
      await withDocument(async (doc) => {
        await signTimestamped(doc);
        const { now, then } = await both(doc);
        for (const verdict of [now, then]) {
          expect(verdict).toMatchObject({
            trust: 'trusted',
            revocation: 'unknown',
            summary: 'valid',
          });
        }
        // The reason names the time the answers were asked about.
        expect(now.revocationReason).toBe('no answer about "Ada" speaks for now');
        expect(then.revocationReason).toBe(
          `no answer about "Ada" speaks for ${SIGNED.toISOString()}`,
        );
        expect(then.validationTime).toMatchObject({ kind: 'timestamp' });
      });
    });

    test('a good answer from the time of signing: good at the timestamp, unknown now', async () => {
      await freshSigner();
      await withDocument(async (doc) => {
        await signTimestamped(doc);
        // The authority's answer speaks for one hour, which ended hours ago.
        await doc.signatures.addValidationInfo({
          ocspResponses: [await answer('ocsp', after(MINUTE))],
        });
        const { now, then } = await both(doc);
        expect(then).toMatchObject({ revocation: 'good', summary: 'valid' });
        expect(then.revocationReason).toBeUndefined();
        // Stored when the document was signed, it says nothing about today.
        expect(now).toMatchObject({ revocation: 'unknown', summary: 'valid' });
      });
    });

    test('withdrawn after signing: good at the timestamp, revoked now', async () => {
      await freshSigner();
      await withDocument(async (doc) => {
        await signTimestamped(doc);
        ca.revoke(signer, { at: after(2 * HOUR), reason: 'key-compromise' });
        await doc.signatures.addValidationInfo({ crls: [await answer('crl', after(3 * HOUR))] });
        const { now, then } = await both(doc);
        // It had not been withdrawn yet when it signed.
        expect(then).toMatchObject({ revocation: 'good', summary: 'valid' });
        expect(now).toMatchObject({ trust: 'trusted', revocation: 'revoked', summary: 'invalid' });
        expect(now.revocationReason).toBe(
          `"Ada" was withdrawn on ${after(2 * HOUR).toISOString()} (key-compromise)`,
        );
        expect(now.longTerm.enabled).toBe(true);
      });
    });

    test('withdrawn before signing: revoked at the timestamp too, and the signature is invalid', async () => {
      await freshSigner();
      await withDocument(async (doc) => {
        await signTimestamped(doc);
        ca.revoke(signer, { at: after(-HOUR) });
        await doc.signatures.addValidationInfo({
          ocspResponses: [await answer('ocsp', after(MINUTE))],
        });
        const { now, then } = await both(doc);
        for (const verdict of [now, then]) {
          expect(verdict).toMatchObject({ revocation: 'revoked', summary: 'invalid' });
          expect(verdict.revocationReason).toMatch(/^"Ada" was withdrawn on /);
        }
        expect(then.longTerm).toMatchObject({
          enabled: false,
          expiresAt: null,
          missing: [{ certificate: 'Ada', reason: 'revoked' }],
        });
      });
    });

    test('a later good answer does not undo a withdrawal', async () => {
      await freshSigner();
      await withDocument(async (doc) => {
        await signTimestamped(doc);
        const good = await answer('ocsp', after(MINUTE));
        ca.revoke(signer, { at: after(-HOUR) });
        await doc.signatures.addValidationInfo({
          ocspResponses: [good],
          crls: [await answer('crl', after(2 * MINUTE))],
        });
        expect((await both(doc)).then.revocation).toBe('revoked');
      });
    });

    test('an answer about another certificate is set aside', async () => {
      await freshSigner();
      await withDocument(async (doc) => {
        await signTimestamped(doc);
        const ada = signer;
        // The same authority's answer, about someone else.
        signer = await ca.issueSigner({ commonName: 'Grace' });
        const about = await answer('ocsp', after(MINUTE));
        signer = ada;
        await doc.signatures.addValidationInfo({ ocspResponses: [about] });
        expect((await both(doc)).then.revocation).toBe('unknown');
      });
    });

    test('a signer you do not trust: unknown, with no issuer to check an answer against', async () => {
      await freshSigner();
      await withDocument(async (doc) => {
        await signTimestamped(doc);
        ca.revoke(signer, { at: after(-HOUR) });
        await doc.signatures.addValidationInfo({
          ocspResponses: [await answer('ocsp', after(MINUTE))],
        });
        const other = await createTestCertificateAuthority();
        const { then } = await both(doc, {
          anchors: async () => [other.certificate],
          timestampAnchors: async () => [authority.certificate],
        });
        // The withdrawal is in the file, and nobody you trust vouches for who says so.
        expect(then).toMatchObject({
          trust: 'untrusted',
          revocation: 'unknown',
          summary: 'valid-untrusted',
        });
        expect(then.revocationReason).toMatch(/not trusted/);
        expect(then.longTerm).toMatchObject({
          enabled: false,
          missing: [{ certificate: 'Ada', reason: 'untrusted' }],
        });
      });
    });

    test('a certificate trusted as it is has nothing to ask about', async () => {
      // A certificate that signed itself: no issuer exists that could withdraw it.
      const own = await createTestSigner({ commonName: 'a signer of its own' });
      await withDocument(async (doc) => {
        await sign(doc, { field, key: own, timestampAuthority: stamping(authority, SIGNED) });
        const { now } = await both(doc, {
          anchors: async () => [own.certificate],
          timestampAnchors: async () => [authority.certificate],
        });
        expect(now).toMatchObject({ trust: 'trusted', revocation: 'good', summary: 'valid' });
        // The timestamp's authority is trusted the same way.
        expect(now.timestamp).toMatchObject({ summary: 'valid', revocation: 'good' });
        expect(now.longTerm.enabled).toBe(true);
      });
    });

    test('a path is built from the certificates the file holds', async () => {
      const root = await createIdentity({ commonName: 'a root', ca: true });
      const intermediate = await createIdentity({
        commonName: 'an intermediate',
        issuer: root,
        ca: true,
      });
      const leaf = await createIdentity({ commonName: 'a leaf', issuer: intermediate });
      // A signature that carries the signer's certificate and none above it.
      const alone = webCryptoSigner({
        privateKey: leaf.keys.privateKey,
        certificateChain: [leaf.certificate],
      });
      const port: TrustPort = { anchors: async () => [root.certificate] };
      await withDocument(async (doc) => {
        await sign(doc, { field, key: alone });
        const [before] = await validateSignatures(doc, { trust: port });
        expect(before).toMatchObject({ trust: 'untrusted', revocation: 'unknown' });
        expect(before!.trustReason).toMatch(/issued "a leaf"/);

        await doc.signatures.addValidationInfo({ certificates: [intermediate.certificate] });
        const [found] = await validateSignatures(doc, { trust: port });
        expect(found).toMatchObject({ trust: 'trusted', summary: 'valid' });
        expect(found!.revocationReason).toMatch(/no answer about "a leaf"/);
      });
    });
  });

  describe('long-term validation', () => {
    test('a timestamp, a trusted signer and a good answer in the file: enabled', async () => {
      await freshSigner();
      await withDocument(async (doc) => {
        await signTimestamped(doc);
        const bare = await both(doc);
        const gap = {
          enabled: false,
          provenAt: SIGNED.toISOString(),
          expiresAt: null,
          documentTimestampedAt: null,
          missing: [{ certificate: 'Ada', reason: 'no-answer' }],
        };
        expect(bare.then.longTerm).toEqual(gap);
        // It speaks for the timestamp, whatever time the signature is judged at.
        expect(bare.now.longTerm).toEqual(gap);

        await doc.signatures.addValidationInfo({
          ocspResponses: [await answer('ocsp', after(MINUTE))],
        });
        const enabled = {
          enabled: true,
          provenAt: SIGNED.toISOString(),
          expiresAt: certificateFromDer(authority.certificate).notAfter.value.toISOString(),
          documentTimestampedAt: null,
          missing: [],
        };
        const stored = await both(doc);
        expect(stored.then.longTerm).toEqual(enabled);
        expect(stored.now.longTerm).toEqual(enabled);
      });
    });

    test('a document timestamp added later is named, and moves the expiry to its own certificate', async () => {
      await freshSigner();
      const later = await createTimestampAuthorityIdentity('a later authority', undefined, {
        notBefore: new Date(Date.now() - 60 * DAY),
        notAfter: new Date(Date.now() + 900 * DAY),
      });
      const port: TrustPort = {
        anchors: async () => [ca.certificate],
        timestampAnchors: async () => [authority.certificate, later.certificate],
      };
      const stamped = after(HOUR);
      await withDocument(async (doc) => {
        await signTimestamped(doc);
        await doc.signatures.addValidationInfo({
          ocspResponses: [await answer('ocsp', after(MINUTE))],
        });
        const page = (await doc.pages.list()).pages[0]!;
        await doc.forms.create({
          kind: 'signature',
          name: 'stamp',
          widget: { page: page.ref, rect: { x: 300, y: 600, width: 100, height: 30 } },
        } as never);
        await sign(doc, {
          field: { kind: 'fqn', name: 'stamp' },
          kind: 'timestamp',
          key: stamping(later, stamped),
        });

        const verdicts = await validateSignatures(doc, { trust: port });
        const signature = verdicts.find((verdict) => verdict.signature.kind === 'signature')!;
        const timestamp = verdicts.find((verdict) => verdict.signature.kind === 'timestamp')!;
        expect(signature.longTerm).toEqual({
          enabled: true,
          provenAt: SIGNED.toISOString(),
          expiresAt: certificateFromDer(later.certificate).notAfter.value.toISOString(),
          documentTimestampedAt: stamped.toISOString(),
          missing: [],
        });
        // The document timestamp is judged the same way, for its own authority.
        expect(timestamp.longTerm).toEqual({
          enabled: true,
          provenAt: stamped.toISOString(),
          expiresAt: certificateFromDer(later.certificate).notAfter.value.toISOString(),
          documentTimestampedAt: null,
          missing: [],
        });
      });
    });

    test('no timestamp: no time is proven, whatever the file holds', async () => {
      await freshSigner();
      await withDocument(async (doc) => {
        await sign(doc, { field, key: signer });
        await doc.signatures.addValidationInfo({
          ocspResponses: [await answer('ocsp', new Date())],
        });
        const { now, then } = await both(doc);
        // With no timestamp to go by, nothing asked for is judged now too.
        expect(then.validationTime).toEqual({ kind: 'now' });
        expect(then).toMatchObject({ revocation: 'good', summary: 'valid' });
        // Judged now, a fresh answer says good.
        expect(now).toMatchObject({ revocation: 'good', summary: 'valid', timestamp: null });
        expect(now.longTerm).toEqual({
          enabled: false,
          provenAt: null,
          expiresAt: null,
          documentTimestampedAt: null,
          missing: [{ certificate: 'Ada', reason: 'no-timestamp' }],
        });
      });
    });

    test('a timestamp from an authority you do not trust proves no time', async () => {
      await freshSigner();
      await withDocument(async (doc) => {
        await signTimestamped(doc);
        const { then } = await both(doc, { anchors: async () => [ca.certificate] });
        expect(then.timestamp).toMatchObject({ summary: 'valid-untrusted', revocation: 'unknown' });
        expect(then.longTerm).toMatchObject({
          enabled: false,
          provenAt: null,
          missing: [{ certificate: 'Ada', reason: 'no-timestamp' }],
        });
      });
    });
  });

  describe('a timestamp authority under a root', () => {
    let root: TestIdentity;
    let under: TestIdentity;
    let port: TrustPort;

    /** The root's list of withdrawn certificates, made an hour after the signing. */
    const list = (withdrawn: Date | null) =>
      buildCrl({
        issuer: {
          certificate: certificateFromDer(root.certificate),
          privateKey: root.keys.privateKey,
        },
        thisUpdate: after(HOUR),
        nextUpdate: after(7 * DAY),
        revoked: withdrawn
          ? [{ serialNumber: certificateFromDer(under.certificate).serialNumber, at: withdrawn }]
          : [],
      });

    beforeAll(async () => {
      // A root that may sign lists of withdrawn certificates, and an authority it issued.
      const keys = await generateSigningKeyPair('RSA-PKCS1-v1_5', 'sha256', true);
      const certificate = await issueCertificate({
        kind: 'authority',
        commonName: 'the authority root',
        publicKey: keys.publicKey,
        privateKey: keys.privateKey,
        notBefore: new Date(Date.now() - 60 * DAY),
      });
      const der = new Uint8Array(certificate.toSchema(true).toBER(false));
      root = {
        certificate: der,
        keys,
        signer: webCryptoSigner({ privateKey: keys.privateKey, certificateChain: [der] }),
      };
      under = await createTimestampAuthorityIdentity('the issued authority', root, {
        notBefore: new Date(Date.now() - 60 * DAY),
      });
    });

    async function signedUnder(doc: DocumentHandle): Promise<void> {
      await freshSigner();
      port = {
        anchors: async () => [ca.certificate],
        timestampAnchors: async () => [root.certificate],
      };
      await sign(doc, { field, key: signer, timestampAuthority: stamping(under, SIGNED) });
      await doc.signatures.addValidationInfo({
        ocspResponses: [await answer('ocsp', after(MINUTE))],
      });
    }

    test('its certificate needs an answer too', async () => {
      await withDocument(async (doc) => {
        await signedUnder(doc);
        const { then } = await both(doc, port);
        expect(then.timestamp).toMatchObject({ summary: 'valid', revocation: 'unknown' });
        expect(then.longTerm).toMatchObject({
          enabled: false,
          missing: [{ certificate: 'the issued authority', reason: 'no-answer' }],
        });

        await doc.signatures.addValidationInfo({ crls: [await list(null)] });
        const stored = (await both(doc, port)).then;
        expect(stored.timestamp).toMatchObject({ summary: 'valid', revocation: 'good' });
        expect(stored.longTerm).toMatchObject({ enabled: true, missing: [] });
      });
    });

    test('withdrawn by the time it is judged: the timestamp is invalid and proves no time', async () => {
      await withDocument(async (doc) => {
        await signedUnder(doc);
        await doc.signatures.addValidationInfo({ crls: [await list(after(2 * HOUR))] });
        const { then } = await both(doc, port);
        // Nothing after the token vouches for its authority, so the authority is judged now.
        expect(then.timestamp).toMatchObject({
          summary: 'invalid',
          trust: 'trusted',
          revocation: 'revoked',
        });
        expect(then.timestamp!.revocationReason).toMatch(/^"the issued authority" was withdrawn/);
        // The signature keeps its own summary, and is judged now again.
        expect(then).toMatchObject({ summary: 'valid', validationTime: { kind: 'now' } });
        expect(then.longTerm).toMatchObject({
          enabled: false,
          provenAt: null,
          missing: [{ certificate: 'Ada', reason: 'no-timestamp' }],
        });
      });
    });
  });

  test('a token on its own is judged from what it carries', async () => {
    const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', new Uint8Array([1, 2])));
    const token = await buildTestToken({ digest, hash: 'sha256', authority: authority.signer });
    const trusted = await verifyTimestampToken({
      token,
      digest,
      algorithm: 'sha256',
      trust: { anchors: async () => [authority.certificate] },
    });
    expect(trusted).toMatchObject({ summary: 'valid', revocation: 'good', revocationReason: null });
    const alone = await verifyTimestampToken({ token, digest, algorithm: 'sha256' });
    expect(alone).toMatchObject({ summary: 'valid-untrusted', revocation: 'unknown' });
    expect(alone.revocationReason).toMatch(/not trusted/);
  });
});
