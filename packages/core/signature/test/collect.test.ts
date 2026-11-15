/**
 * Collecting validation data: `addValidationInfo()` asks for the answers a file lacks, checks
 * them and stores them, and `validateSignatures()` can ask without storing. The certificate
 * authority is one made for the test, answering from memory.
 */
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { createLocalEngine } from '@embedpdf/engine';
import {
  EngineError,
  EngineErrorCode,
  type DocumentHandle,
  type Engine,
} from '@embedpdf/engine-core/runtime';

import {
  buildCrl,
  buildOcspResponse,
  issueCertificate,
  type Issuer,
} from '../src/signers/test-authority';
import {
  addValidationInfo,
  createTestCertificateAuthority,
  createTestSigner,
  createTestTimestampAuthority,
  generateSigningKeyPair,
  sign,
  validateSignatures,
  webCryptoSigner,
  type CmsSigner,
  type RevocationRequest,
  type RevocationSource,
  type TestCertificateAuthority,
  type TestSigner,
  type TrustPort,
} from '../src/index';
import {
  createOpenSslCertificateAuthority,
  hasOpenSsl,
  opensslReadsOcspResponse,
} from './helpers/openssl';
import { createTimestampAuthorityIdentity, type TestIdentity } from './helpers/pki';
import { buildTestToken } from './helpers/tokens';

const here = dirname(fileURLToPath(import.meta.url));
const fixtures = resolve(here, '..', '..', '..', 'engine', 'main', 'test', 'fixtures');
const field = { kind: 'fqn', name: 'sig' } as const;
const HOUR = 3600 * 1000;
const DAY = 24 * HOUR;
const hex = (bytes: Uint8Array) => Buffer.from(bytes).toString('hex');
const der = (certificate: {
  toSchema(encode: boolean): { toBER(sizeOnly: boolean): ArrayBuffer };
}) => new Uint8Array(certificate.toSchema(true).toBER(false));

/** An authority whose tokens say `genTime`. */
function stamping(identity: TestIdentity, genTime: Date): CmsSigner {
  return {
    kind: 'cms',
    sign: ({ digest, algorithm }) =>
      buildTestToken({ digest, hash: algorithm, authority: identity.signer, genTime }),
  };
}

/** A source that counts what it is asked, and can be told not to answer some of it. */
function watching(
  inner: RevocationSource,
  silent: (request: RevocationRequest) => boolean = () => false,
) {
  const asked: RevocationRequest[] = [];
  const source: RevocationSource = {
    async fetch(request) {
      asked.push(request);
      if (silent(request)) {
        throw new EngineError(EngineErrorCode.Network, `${request.url} did not answer`, {
          details: { source: request.url },
        });
      }
      return inner.fetch(request);
    },
  };
  return { source, asked };
}

async function caught(run: () => Promise<unknown>): Promise<EngineError> {
  try {
    await run();
  } catch (error) {
    expect(EngineError.is(error)).toBe(true);
    return error as EngineError;
  }
  throw new Error('it did not fail');
}

describe('collecting validation data', () => {
  let engine: Engine;
  let bytes: Uint8Array;
  let opened = 0;
  let ca: TestCertificateAuthority;
  let signer: TestSigner;
  /** A timestamp authority trusted as it is: nothing can withdraw it. */
  let authority: TestIdentity;
  let trust: TrustPort;
  /** The signature's timestamp: an hour ago. */
  const SIGNED = new Date(Math.floor((Date.now() - HOUR) / 1000) * 1000);

  beforeAll(async () => {
    engine = createLocalEngine({ runtime: { prefer: 'wasm' } });
    bytes = new Uint8Array(await readFile(resolve(fixtures, 'unsigned_sigfield.pdf')));
    authority = await createTimestampAuthorityIdentity('the timestamp authority', undefined, {
      notBefore: new Date(Date.now() - 60 * DAY),
    });
  });
  afterAll(async () => {
    await engine.destroy();
  });

  /** A fresh authority and signer for each scenario: one's withdrawal is not another's. */
  async function freshSigner(): Promise<void> {
    ca = await createTestCertificateAuthority({ commonName: 'the certificate authority' });
    signer = await ca.issueSigner({ commonName: 'Ada' });
    trust = {
      anchors: async () => [ca.certificate],
      timestampAnchors: async () => [authority.certificate],
    };
  }

  async function withDocument<T>(
    body: (doc: DocumentHandle) => Promise<T>,
    file: Uint8Array = bytes,
  ): Promise<T> {
    const doc = await engine.open({ kind: 'bytes', id: `collect-${opened++}`, bytes: file });
    try {
      return await body(doc);
    } finally {
      await doc.close();
    }
  }

  const signTimestamped = (doc: DocumentHandle) =>
    sign(doc, { field, key: signer, timestampAuthority: stamping(authority, SIGNED) });

  const empty = { certificates: [], ocspResponses: [], crls: [] };
  const storedIn = (doc: DocumentHandle) => doc.signatures.getValidationInfo();

  test('it asks, checks and stores, and the file then reads complete with no network', async () => {
    await freshSigner();
    await withDocument(async (doc) => {
      await signTimestamped(doc);
      const { source, asked } = watching(ca.revocation);

      const result = await addValidationInfo(doc, { trust, revocation: source });
      // One question: the signer's certificate, at its responder. The authority's own
      // certificate is the one you trust, and the timestamp authority is trusted as it is.
      expect(asked.map((request) => request.kind)).toEqual(['ocsp']);
      expect(result.added).toEqual({ certificates: 4, ocspResponses: 1, crls: 0 });
      expect(result.verdicts).toHaveLength(1);
      expect(result.verdicts[0]).toMatchObject({
        summary: 'valid',
        revocation: 'good',
        longTerm: { enabled: true, provenAt: SIGNED.toISOString(), missing: [] },
      });

      // The paths can be followed from the file: the signer, its issuer, the responder that
      // answered, and the timestamp authority.
      const stored = await storedIn(doc);
      expect(stored.ocspResponses).toHaveLength(1);
      const names = stored.certificates.map(hex);
      for (const certificate of [signer.certificate, ca.certificate, authority.certificate]) {
        expect(names).toContain(hex(certificate));
      }

      // A reader with no source finds the same.
      const [offline] = await validateSignatures(doc, { trust });
      expect(offline!.longTerm.enabled).toBe(true);

      // Again: the file holds every answer, so nothing is asked and nothing is added.
      const again = await addValidationInfo(doc, { trust, revocation: source });
      expect(asked).toHaveLength(1);
      expect(again.added).toEqual({ certificates: 0, ocspResponses: 0, crls: 0 });
      expect(again.verdicts[0]!.longTerm.enabled).toBe(true);
    });
  });

  test('answers you already have are used before anyone is asked', async () => {
    await freshSigner();
    await withDocument(async (doc) => {
      await signTimestamped(doc);
      const crl = await ca.revocation.fetch({
        kind: 'crl',
        url: 'http://test-authority.example/crl',
      });

      // No source at all: what is known is enough.
      const result = await addValidationInfo(doc, { trust, known: { crls: [crl] } });
      expect(result.added).toMatchObject({ ocspResponses: 0, crls: 1 });
      expect(result.verdicts[0]!.longTerm.enabled).toBe(true);
      expect((await storedIn(doc)).crls.map(hex)).toEqual([hex(crl)]);
    });
  });

  test('a known answer that says nothing about the certificate is not stored', async () => {
    await freshSigner();
    const other = await createTestCertificateAuthority();
    await withDocument(async (doc) => {
      await signTimestamped(doc);
      const foreign = await other.revocation.fetch({
        kind: 'crl',
        url: 'http://test-authority.example/crl',
      });
      const result = await addValidationInfo(doc, {
        trust,
        revocation: ca.revocation,
        known: { crls: [foreign] },
      });
      expect(result.added).toMatchObject({ ocspResponses: 1, crls: 0 });
    });
  });

  test('a responder that does not answer: the list is asked for instead', async () => {
    await freshSigner();
    await withDocument(async (doc) => {
      await signTimestamped(doc);
      const { source, asked } = watching(ca.revocation, (request) => request.kind === 'ocsp');
      const result = await addValidationInfo(doc, { trust, revocation: source });
      expect(asked.map((request) => request.kind)).toEqual(['ocsp', 'crl']);
      expect(result.added).toMatchObject({ ocspResponses: 0, crls: 1 });
      expect(result.verdicts[0]!.longTerm.enabled).toBe(true);
    });
  });

  test('no address answers: it fails with the address, and stores nothing', async () => {
    await freshSigner();
    await withDocument(async (doc) => {
      await signTimestamped(doc);
      const { source } = watching(ca.revocation, () => true);
      const error = await caught(() => addValidationInfo(doc, { trust, revocation: source }));
      expect(error.code).toBe(EngineErrorCode.Network);
      // The first address that was asked.
      expect(error.details).toMatchObject({ source: 'http://test-authority.example/ocsp' });
      expect(await storedIn(doc)).toEqual(empty);
    });
  });

  test('a source that fails in its own way is reported as an address that did not answer', async () => {
    await freshSigner();
    await withDocument(async (doc) => {
      await signTimestamped(doc);
      const error = await caught(() =>
        addValidationInfo(doc, {
          trust,
          revocation: {
            fetch: async () => {
              throw new TypeError('fetch failed');
            },
          },
        }),
      );
      expect(error.code).toBe(EngineErrorCode.Network);
      expect(error.details).toMatchObject({ source: 'http://test-authority.example/ocsp' });
      expect(error.message).toMatch(/fetch failed/);
    });
  });

  test('with nobody to ask and nothing known, it says which certificate has no answer', async () => {
    await freshSigner();
    await withDocument(async (doc) => {
      await signTimestamped(doc);
      const error = await caught(() => addValidationInfo(doc, { trust }));
      expect(error.code).toBe(EngineErrorCode.SignatureRefused);
      expect(error.details).toEqual({ reason: 'no-answer', certificate: 'Ada', field: 'sig' });
      expect(error.message).toMatch(/no `revocation` source/);
      expect(await storedIn(doc)).toEqual(empty);
    });
  });

  test('a list over maxCrlBytes is named, and not stored', async () => {
    await freshSigner();
    await withDocument(async (doc) => {
      await signTimestamped(doc);
      // The responder says it does not know the certificate, so only the list is left.
      const stranger = await createTestCertificateAuthority();
      const source: RevocationSource = {
        fetch: (request) =>
          request.kind === 'ocsp'
            ? stranger.revocation.fetch(request)
            : ca.revocation.fetch(request),
      };
      const error = await caught(() =>
        addValidationInfo(doc, { trust, revocation: source, maxCrlBytes: 64 }),
      );
      expect(error.code).toBe(EngineErrorCode.SignatureRefused);
      expect(error.details).toMatchObject({ reason: 'no-answer', certificate: 'Ada' });
      expect(error.message).toMatch(/over maxCrlBytes \(64\)/);
      expect(await storedIn(doc)).toEqual(empty);

      // With room for it, the list is the answer.
      const result = await addValidationInfo(doc, { trust, revocation: source });
      expect(result.added).toMatchObject({ ocspResponses: 0, crls: 1 });
    });
  });

  test('bad news fails the call: a certificate withdrawn before the signature', async () => {
    await freshSigner();
    await withDocument(async (doc) => {
      await signTimestamped(doc);
      ca.revoke(signer, { at: new Date(SIGNED.getTime() - HOUR), reason: 'key-compromise' });
      const error = await caught(() =>
        addValidationInfo(doc, { trust, revocation: ca.revocation }),
      );
      expect(error.code).toBe(EngineErrorCode.SignatureRefused);
      expect(error.details).toEqual({ reason: 'revoked', certificate: 'Ada', field: 'sig' });
      expect(await storedIn(doc)).toEqual(empty);

      // With `partial` the answer is kept, and the verdict says what it says.
      const result = await addValidationInfo(doc, {
        trust,
        revocation: ca.revocation,
        partial: true,
      });
      expect(result.added.ocspResponses).toBe(1);
      expect(result.verdicts[0]).toMatchObject({
        summary: 'invalid',
        revocation: 'revoked',
        longTerm: { enabled: false, missing: [{ certificate: 'Ada', reason: 'revoked' }] },
      });
    });
  });

  test('a certificate withdrawn after the signature is still good at its timestamp', async () => {
    await freshSigner();
    await withDocument(async (doc) => {
      await signTimestamped(doc);
      ca.revoke(signer, { at: new Date(SIGNED.getTime() + 10 * 60 * 1000) });
      const result = await addValidationInfo(doc, { trust, revocation: ca.revocation });
      expect(result.verdicts[0]).toMatchObject({
        summary: 'valid',
        revocation: 'good',
        longTerm: { enabled: true },
      });
    });
  });

  test('a signature with no timestamp, or from a signer you do not trust, is refused by name', async () => {
    await freshSigner();
    await withDocument(async (doc) => {
      await sign(doc, { field, key: signer });
      const error = await caught(() =>
        addValidationInfo(doc, { trust, revocation: ca.revocation }),
      );
      expect(error.code).toBe(EngineErrorCode.SignatureRefused);
      expect(error.details).toEqual({ reason: 'no-timestamp', certificate: 'Ada', field: 'sig' });

      // `partial` stores nothing it has no use for, and says what is missing.
      const result = await addValidationInfo(doc, {
        trust,
        revocation: ca.revocation,
        partial: true,
      });
      expect(result.verdicts[0]!.longTerm.missing).toEqual([
        { certificate: 'Ada', reason: 'no-timestamp' },
      ]);
    });
    await withDocument(async (doc) => {
      await signTimestamped(doc);
      const other = await createTestCertificateAuthority();
      const { source, asked } = watching(ca.revocation);
      const error = await caught(() =>
        addValidationInfo(doc, {
          trust: {
            anchors: async () => [other.certificate],
            timestampAnchors: async () => [authority.certificate],
          },
          revocation: source,
        }),
      );
      expect(error.details).toEqual({ reason: 'untrusted', certificate: 'Ada', field: 'sig' });
      // Nobody is asked about a certificate that leads nowhere you trust.
      expect(asked.filter((request) => request.kind !== 'issuer')).toEqual([]);
      expect(await storedIn(doc)).toEqual(empty);
    });
  });

  test('`trust` is required', async () => {
    await withDocument(async (doc) => {
      const error = await caught(() =>
        addValidationInfo(doc, {} as Parameters<typeof addValidationInfo>[1]),
      );
      expect(error.code).toBe(EngineErrorCode.InvalidArg);
      expect(error.details).toEqual({ field: 'trust' });
    });
  });

  test('`fields` covers the signatures it names, and a field with no signature is not found', async () => {
    await freshSigner();
    const lone = await createTestSigner({ commonName: 'no timestamp' });
    await withDocument(async (doc) => {
      await signTimestamped(doc);
      const page = (await doc.pages.list()).pages[0]!;
      await doc.forms.create({
        kind: 'signature',
        name: 'second',
        widget: { page: page.ref, rect: { x: 300, y: 600, width: 100, height: 30 } },
      } as never);
      await sign(doc, { field: { kind: 'fqn', name: 'second' }, key: lone });

      // The second signature has no timestamp: covering every signature fails on it.
      const error = await caught(() =>
        addValidationInfo(doc, { trust, revocation: ca.revocation }),
      );
      expect(error.details).toMatchObject({ reason: 'no-timestamp', field: 'second' });

      const result = await addValidationInfo(doc, {
        trust,
        revocation: ca.revocation,
        fields: [field],
      });
      expect(result.added.ocspResponses).toBe(1);
      // Every signature has a verdict, covered or not.
      expect(result.verdicts.map((verdict) => verdict.longTerm.enabled)).toEqual([true, false]);

      const missing = await caught(() =>
        addValidationInfo(doc, { trust, fields: [{ kind: 'fqn', name: 'nobody' }] }),
      );
      expect(missing.code).toBe(EngineErrorCode.NotFound);
    });
  });

  test('after a certification that allows no changes it fails before anyone is asked', async () => {
    const certified = new Uint8Array(
      await readFile(resolve(fixtures, 'signature-long-term/ours-certified-p1-b-t.pdf')),
    );
    await freshSigner();
    await withDocument(async (doc) => {
      const { source, asked } = watching(ca.revocation);
      const error = await caught(() => addValidationInfo(doc, { trust, revocation: source }));
      expect(error.code).toBe(EngineErrorCode.ProtectedDocument);
      expect(asked).toEqual([]);
    }, certified);
  });

  test('the whole way: sign, store the answers, then timestamp the document with no field made first', async () => {
    await freshSigner();
    const stamper = await createTestTimestampAuthority({ commonName: 'the document stamper' });
    const port: TrustPort = {
      anchors: async () => [ca.certificate],
      timestampAnchors: async () => [authority.certificate, stamper.certificate],
    };
    const read = async (doc: DocumentHandle) => {
      const verdicts = await validateSignatures(doc, { trust: port });
      return {
        signature: verdicts.find((verdict) => verdict.signature.kind === 'signature')!,
        timestamp: verdicts.find((verdict) => verdict.signature.kind === 'timestamp')!,
      };
    };
    const saved = await withDocument(async (doc) => {
      await signTimestamped(doc);
      await addValidationInfo(doc, { trust: port, revocation: ca.revocation });
      // No field: the engine makes one for the timestamp.
      const stamped = await sign(doc, { kind: 'timestamp', key: stamper });
      expect(stamped.signature).toMatchObject({ kind: 'timestamp', fieldName: 'Timestamp1' });

      const { signature, timestamp } = await read(doc);
      expect(timestamp).toMatchObject({
        integrity: 'valid',
        summary: 'valid',
        longTerm: { enabled: true },
      });
      // The signature is as it was sealed, checkable from the file, with a timestamp over it.
      expect(signature).toMatchObject({
        summary: 'valid',
        revocation: 'good',
        modifications: { verdict: 'permitted' },
        longTerm: {
          enabled: true,
          provenAt: SIGNED.toISOString(),
          documentTimestampedAt: timestamp.timestamp!.stampedAt,
          missing: [],
        },
      });
      return doc.download();
    });
    // The same from the saved file, with nobody to ask.
    await withDocument(async (doc) => {
      const { signature, timestamp } = await read(doc);
      expect(signature).toMatchObject({ summary: 'valid', longTerm: { enabled: true } });
      expect(signature.longTerm.documentTimestampedAt).toBe(timestamp.timestamp!.stampedAt);
      // The file as it was, the signature, and one revision that holds the answers and the
      // timestamp: the timestamp seals in what was stored before it.
      expect((await doc.signatures.list()).revisions).toHaveLength(3);
    }, saved);
  });

  test('a signature still needs its field, and a key of your own cannot timestamp', async () => {
    await freshSigner();
    await withDocument(async (doc) => {
      const noField = await caught(() => sign(doc, { key: signer }));
      expect(noField.code).toBe(EngineErrorCode.InvalidArg);
      expect(noField.details).toMatchObject({ field: 'field' });
      const ownKey = await caught(() => sign(doc, { kind: 'timestamp', key: signer }));
      expect(ownKey.code).toBe(EngineErrorCode.InvalidArg);
      expect((await doc.signatures.list()).signatures.filter((entry) => entry.signed)).toEqual([]);
    });
  });

  describe('a signer under an intermediate the signature leaves out', () => {
    const URL_BASE = 'http://issuing.invalid';
    let root: Issuer;
    let intermediate: Issuer;
    let leaf: TestSigner;
    let source: RevocationSource;
    let asked: RevocationRequest[];
    let port: TrustPort;

    beforeAll(async () => {
      const make = async (
        kind: 'authority' | 'signer',
        commonName: string,
        issuer?: Issuer,
        addresses?: { ocsp?: string; crl?: string; issuer?: string },
      ): Promise<Issuer> => {
        const keys = await generateSigningKeyPair('RSA-PKCS1-v1_5', 'sha256', true);
        return {
          certificate: await issueCertificate({
            kind,
            commonName,
            publicKey: keys.publicKey,
            ...(issuer ? { issuer } : { privateKey: keys.privateKey }),
            ...(addresses ? { addresses } : {}),
          }),
          privateKey: keys.privateKey,
        };
      };
      root = await make('authority', 'the root');
      // The intermediate names where the root's list is; the signer names its issuer's
      // certificate and responder.
      intermediate = await make('authority', 'the intermediate', root, {
        crl: `${URL_BASE}/root.crl`,
      });
      const signing = await make('signer', 'Grace', intermediate, {
        ocsp: `${URL_BASE}/ocsp`,
        issuer: `${URL_BASE}/intermediate.cer`,
      });
      const leafDer = der(signing.certificate);
      leaf = {
        ...webCryptoSigner({ privateKey: signing.privateKey, certificateChain: [leafDer] }),
        certificate: leafDer,
        privateKey: signing.privateKey,
      };
      const answers: RevocationSource = {
        async fetch(request) {
          if (request.url === `${URL_BASE}/intermediate.cer`) return der(intermediate.certificate);
          if (request.url === `${URL_BASE}/root.crl`) {
            return buildCrl({
              issuer: root,
              thisUpdate: new Date(),
              nextUpdate: new Date(Date.now() + DAY),
              revoked: [],
            });
          }
          if (request.url === `${URL_BASE}/ocsp`) {
            return buildOcspResponse({
              certificate: signing.certificate,
              issuer: intermediate.certificate,
              signer: intermediate,
              status: 'good',
              producedAt: new Date(),
              thisUpdate: new Date(),
              nextUpdate: new Date(Date.now() + HOUR),
            });
          }
          throw new Error(`nothing is served at ${request.url}`);
        },
      };
      ({ source, asked } = watching(answers));
      port = {
        anchors: async () => [der(root.certificate)],
        timestampAnchors: async () => [authority.certificate],
      };
    });

    test('the issuer is fetched, the path is followed, and the file then holds it all', async () => {
      await withDocument(async (doc) => {
        await sign(doc, { field, key: leaf, timestampAuthority: stamping(authority, SIGNED) });
        const [before] = await validateSignatures(doc, { trust: port });
        expect(before).toMatchObject({ trust: 'untrusted' });
        expect(before!.trustReason).toMatch(/issued "Grace"/);

        const result = await addValidationInfo(doc, { trust: port, revocation: source });
        expect(asked.map((request) => `${request.kind} ${request.url}`)).toEqual([
          `issuer ${URL_BASE}/intermediate.cer`,
          `ocsp ${URL_BASE}/ocsp`,
          `crl ${URL_BASE}/root.crl`,
        ]);
        expect(result.added).toMatchObject({ ocspResponses: 1, crls: 1 });
        expect(result.verdicts[0]).toMatchObject({
          trust: 'trusted',
          revocation: 'good',
          longTerm: { enabled: true },
        });

        // From the file alone, with nobody to ask: the intermediate is in it now.
        const stored = await storedIn(doc);
        expect(stored.certificates.map(hex)).toContain(hex(der(intermediate.certificate)));
        const [offline] = await validateSignatures(doc, { trust: port });
        expect(offline).toMatchObject({ trust: 'trusted', longTerm: { enabled: true } });
      });
    });

    test('a fetched certificate is only a candidate: it never makes a path trusted', async () => {
      const elsewhere = await createTestCertificateAuthority();
      await withDocument(async (doc) => {
        await sign(doc, { field, key: leaf, timestampAuthority: stamping(authority, SIGNED) });
        const error = await caught(() =>
          addValidationInfo(doc, {
            trust: {
              anchors: async () => [elsewhere.certificate],
              timestampAnchors: async () => [authority.certificate],
            },
            revocation: source,
          }),
        );
        expect(error.details).toMatchObject({ reason: 'untrusted', certificate: 'Grace' });
        expect(await storedIn(doc)).toEqual(empty);
      });
    });
  });

  describe('asking while checking', () => {
    test('`revocation` on validateSignatures() asks, uses the answers, and stores nothing', async () => {
      await freshSigner();
      await withDocument(async (doc) => {
        await signTimestamped(doc);
        const { source, asked } = watching(ca.revocation);

        const [asking] = await validateSignatures(doc, { trust, revocation: source });
        expect(asking).toMatchObject({ revocation: 'good', summary: 'valid' });
        expect(asked).toHaveLength(1);
        // The file holds none of it: long-term validation is about the file.
        expect(asking!.longTerm).toMatchObject({
          enabled: false,
          missing: [{ certificate: 'Ada', reason: 'no-answer' }],
        });
        expect(await storedIn(doc)).toEqual(empty);

        // Judged as of now, asking is the only way to an answer.
        const now = { kind: 'now' } as const;
        const [silent] = await validateSignatures(doc, { trust, validationTime: now });
        expect(silent!.revocation).toBe('unknown');
        const [answered] = await validateSignatures(doc, {
          trust,
          validationTime: now,
          revocation: source,
        });
        expect(answered!.revocation).toBe('good');
      });
    });

    test('a withdrawal that is only known online makes the signature invalid as of now', async () => {
      await freshSigner();
      await withDocument(async (doc) => {
        await signTimestamped(doc);
        ca.revoke(signer, { at: new Date(SIGNED.getTime() + 10 * 60 * 1000) });
        const [then] = await validateSignatures(doc, { trust, revocation: ca.revocation });
        expect(then).toMatchObject({ revocation: 'good', summary: 'valid' });
        const [now] = await validateSignatures(doc, {
          trust,
          validationTime: { kind: 'now' },
          revocation: ca.revocation,
        });
        expect(now).toMatchObject({ revocation: 'revoked', summary: 'invalid' });
      });
    });

    test('an address that does not answer leaves the answer unknown, and fails nothing', async () => {
      await freshSigner();
      await withDocument(async (doc) => {
        await signTimestamped(doc);
        const { source } = watching(ca.revocation, () => true);
        const [verdict] = await validateSignatures(doc, { trust, revocation: source });
        expect(verdict).toMatchObject({ revocation: 'unknown', summary: 'valid' });
      });
    });
  });

  describe.skipIf(!hasOpenSsl)('with OpenSSL as the certificate authority', () => {
    test('its answers are asked for, checked and stored, and OpenSSL verifies what the file holds', async () => {
      const openssl = createOpenSslCertificateAuthority();
      try {
        const issued = openssl.issueSigner('Signed under OpenSSL');
        const privateKey = await crypto.subtle.importKey(
          'pkcs8',
          new Uint8Array(issued.privateKey),
          { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
          true,
          ['sign'],
        );
        const key = webCryptoSigner({
          privateKey,
          certificateChain: [issued.certificate, openssl.certificate],
        });
        const port: TrustPort = {
          anchors: async () => [openssl.certificate],
          timestampAnchors: async () => [authority.certificate],
        };
        // The addresses its certificates name, answered by `openssl ocsp` and `openssl ca`.
        const { source, asked } = watching({
          fetch: async (request) => {
            if (request.kind === 'ocsp') return openssl.answer(request.body);
            if (request.kind === 'crl') return openssl.crl();
            throw new Error(`nothing is served at ${request.url}`);
          },
        });

        await withDocument(async (doc) => {
          // The certificate was issued a moment ago: a timestamp before that would prove the
          // signature older than its own certificate.
          await sign(doc, { field, key, timestampAuthority: stamping(authority, new Date()) });
          const result = await addValidationInfo(doc, { trust: port, revocation: source });
          expect(asked.map((request) => `${request.kind} ${request.url}`)).toEqual([
            'ocsp http://openssl-authority.invalid/ocsp',
          ]);
          expect(result.added).toMatchObject({ ocspResponses: 1, crls: 0 });
          expect(result.verdicts[0]).toMatchObject({
            summary: 'valid',
            revocation: 'good',
            longTerm: { enabled: true },
          });

          // OpenSSL checks the answer the file now holds, about the certificate that signed.
          const stored = await storedIn(doc);
          const read = opensslReadsOcspResponse({
            response: stored.ocspResponses[0]!,
            certificate: issued.certificate,
            issuer: openssl.certificate,
          });
          expect(read.verified, read.output).toBe(true);
          expect(read.status).toBe('good');
        });

        // Withdrawn since: a new document signed with it is refused, on OpenSSL's word.
        openssl.revoke(issued.certificate, 'keyCompromise');
        await withDocument(async (doc) => {
          await sign(doc, { field, key, timestampAuthority: stamping(authority, new Date()) });
          const error = await caught(() =>
            addValidationInfo(doc, { trust: port, revocation: source }),
          );
          expect(error.details).toMatchObject({
            reason: 'revoked',
            certificate: 'Signed under OpenSSL',
          });
        });
      } finally {
        openssl.dispose();
      }
    });
  });
});
